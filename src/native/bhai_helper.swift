import Foundation
import AppKit
import CoreAudio

// JSON structures
struct Request: Codable {
    let action: String
    let params: [String: AnyCodable]?
}

struct Response<T: Codable>: Codable {
    let ok: Bool
    let data: T?
    let error: ErrorDetail?
}

struct ErrorDetail: Codable {
    let code: String
    let message: String
}

// AnyCodable helper for dynamic parameters
enum AnyCodable: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) { self = .string(s); return }
        if let i = try? container.decode(Int.self) { self = .int(i); return }
        if let d = try? container.decode(Double.self) { self = .double(d); return }
        if let b = try? container.decode(Bool.self) { self = .bool(b); return }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported value")
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .int(let i): try container.encode(i)
        case .double(let d): try container.encode(d)
        case .bool(let b): try container.encode(b)
        }
    }
    
    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
    
    var intValue: Int? {
        if case .int(let i) = self { return i }
        if case .double(let d) = self { return Int(d) }
        return nil
    }
    
    var floatValue: Float? {
        if case .double(let d) = self { return Float(d) }
        if case .int(let i) = self { return Float(i) }
        return nil
    }
}

// Response models
struct AppStatusData: Codable {
    let running: Bool
    let bundleId: String
    let pid: Int32?
    let localizedName: String?
}

struct AppQuitData: Codable {
    let requested: Bool
    let terminated: Bool
    let reason: String?
}

struct AudioCapabilitiesData: Codable {
    let supported: Bool
    let deviceId: UInt32
    let deviceName: String?
    let canSetVolume: Bool
    let currentVolume: Float?
}

struct AudioSetVolumeData: Codable {
    let deviceId: UInt32
    let previousVolume: Float?
    let targetVolume: Float
    let appliedVolume: Float?
}

// Helper functions for CoreAudio
func getDefaultOutputDevice() -> AudioDeviceID? {
    var defaultOutputDeviceID = AudioDeviceID(0)
    var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    
    let status = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &propertyAddress,
        0,
        nil,
        &propertySize,
        &defaultOutputDeviceID
    )
    
    if status == noErr && defaultOutputDeviceID != kAudioDeviceUnknown {
        return defaultOutputDeviceID
    }
    return nil
}

func getDeviceName(deviceId: AudioDeviceID) -> String? {
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceNameCFString,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceName: Unmanaged<CFString>?
    var propertySize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    let status = AudioObjectGetPropertyData(deviceId, &propertyAddress, 0, nil, &propertySize, &deviceName)
    if status == noErr, let name = deviceName?.takeRetainedValue() {
        return name as String
    }
    return nil
}

func getOutputVolume(deviceId: AudioDeviceID) -> (volume: Float?, settable: Bool) {
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    
    var settable: DarwinBoolean = false
    let settableStatus = AudioObjectIsPropertySettable(deviceId, &propertyAddress, &settable)
    let isSettable = (settableStatus == noErr && settable.boolValue)
    
    var volume = Float32(0.0)
    var propertySize = UInt32(MemoryLayout<Float32>.size)
    let getStatus = AudioObjectGetPropertyData(deviceId, &propertyAddress, 0, nil, &propertySize, &volume)
    
    if getStatus == noErr {
        return (volume, isSettable)
    }
    
    // Check channel 1 / 2 if main element fails
    var channel1Address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: 1
    )
    let chStatus = AudioObjectGetPropertyData(deviceId, &channel1Address, 0, nil, &propertySize, &volume)
    if chStatus == noErr {
        let chSettable = AudioObjectIsPropertySettable(deviceId, &channel1Address, &settable)
        return (volume, chSettable == noErr && settable.boolValue)
    }
    
    return (nil, isSettable)
}

func setOutputVolume(deviceId: AudioDeviceID, target: Float) -> Bool {
    var volume = Float32(max(0.0, min(1.0, target)))
    let propertySize = UInt32(MemoryLayout<Float32>.size)
    
    var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    
    let status = AudioObjectSetPropertyData(deviceId, &propertyAddress, 0, nil, propertySize, &volume)
    if status == noErr {
        return true
    }
    
    // Try channels 1 and 2
    var ch1Address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: 1
    )
    var ch2Address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyVolumeScalar,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: 2
    )
    
    let s1 = AudioObjectSetPropertyData(deviceId, &ch1Address, 0, nil, propertySize, &volume)
    let s2 = AudioObjectSetPropertyData(deviceId, &ch2Address, 0, nil, propertySize, &volume)
    return s1 == noErr || s2 == noErr
}

// Main execution
func run() {
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    guard !inputData.isEmpty else {
        outputError(code: "EMPTY_INPUT", message: "No input received on stdin")
        return
    }
    
    guard inputData.count <= 65536 else {
        outputError(code: "PAYLOAD_TOO_LARGE", message: "Input exceeded maximum allowed payload size (64KB)")
        return
    }
    
    let decoder = JSONDecoder()
    let request: Request
    do {
        request = try decoder.decode(Request.self, from: inputData)
    } catch {
        outputError(code: "INVALID_JSON", message: "Failed to parse JSON input: \(error.localizedDescription)")
        return
    }
    
    switch request.action {
    case "app.status":
        guard let bundleId = request.params?["bundleId"]?.stringValue, !bundleId.isEmpty else {
            outputError(code: "MISSING_PARAM", message: "bundleId parameter is required")
            return
        }
        let runningApps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        if let app = runningApps.first {
            let data = AppStatusData(
                running: true,
                bundleId: bundleId,
                pid: app.processIdentifier,
                localizedName: app.localizedName
            )
            outputSuccess(data: data)
        } else {
            let data = AppStatusData(
                running: false,
                bundleId: bundleId,
                pid: nil,
                localizedName: nil
            )
            outputSuccess(data: data)
        }
        
    case "app.requestQuit":
        guard let bundleId = request.params?["bundleId"]?.stringValue, !bundleId.isEmpty else {
            outputError(code: "MISSING_PARAM", message: "bundleId parameter is required")
            return
        }
        let runningApps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        guard let app = runningApps.first else {
            let data = AppQuitData(requested: false, terminated: false, reason: "app_not_running")
            outputSuccess(data: data)
            return
        }
        
        let terminated = app.terminate()
        let data = AppQuitData(
            requested: true,
            terminated: terminated,
            reason: terminated ? nil : "termination_refused_or_prompting"
        )
        outputSuccess(data: data)
        
    case "audio.capabilities":
        guard let deviceId = getDefaultOutputDevice() else {
            let data = AudioCapabilitiesData(
                supported: false,
                deviceId: 0,
                deviceName: nil,
                canSetVolume: false,
                currentVolume: nil
            )
            outputSuccess(data: data)
            return
        }
        let name = getDeviceName(deviceId: deviceId)
        let volInfo = getOutputVolume(deviceId: deviceId)
        let data = AudioCapabilitiesData(
            supported: true,
            deviceId: deviceId,
            deviceName: name,
            canSetVolume: volInfo.settable,
            currentVolume: volInfo.volume
        )
        outputSuccess(data: data)
        
    case "audio.setVolume":
        guard let volParam = request.params?["volume"]?.floatValue else {
            outputError(code: "MISSING_PARAM", message: "volume parameter (0-100) is required")
            return
        }
        if volParam < 0 || volParam > 100 {
            outputError(code: "INVALID_RANGE", message: "volume must be between 0 and 100")
            return
        }
        guard let deviceId = getDefaultOutputDevice() else {
            outputError(code: "NO_OUTPUT_DEVICE", message: "No active default audio output device found")
            return
        }
        
        let scalar = volParam / 100.0
        let prev = getOutputVolume(deviceId: deviceId).volume
        let success = setOutputVolume(deviceId: deviceId, target: scalar)
        if !success {
            outputError(code: "SET_VOLUME_FAILED", message: "Audio device does not support volume modification or operation failed")
            return
        }
        let newVol = getOutputVolume(deviceId: deviceId).volume
        let data = AudioSetVolumeData(
            deviceId: deviceId,
            previousVolume: prev,
            targetVolume: scalar,
            appliedVolume: newVol
        )
        outputSuccess(data: data)
        
    default:
        outputError(code: "UNKNOWN_ACTION", message: "Action '\(request.action)' is not supported")
    }
}

func outputSuccess<T: Codable>(data: T) {
    let res = Response(ok: true, data: data, error: nil)
    if let encoded = try? JSONEncoder().encode(res) {
        FileHandle.standardOutput.write(encoded)
        print("")
    }
}

func outputError(code: String, message: String) {
    let res = Response<String>(ok: false, data: nil, error: ErrorDetail(code: code, message: message))
    if let encoded = try? JSONEncoder().encode(res) {
        FileHandle.standardOutput.write(encoded)
        print("")
    }
}

run()
