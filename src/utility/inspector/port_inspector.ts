import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ProjectRepository } from '../storage/project_repository';

export interface PortProcessInfo {
  command: string;
  pid: number;
  user: string;
  fd?: string;
  type?: string;
  device?: string;
  node?: string;
  name?: string;
}

export interface PortInspectResult {
  port: number;
  inUse: boolean;
  processes: PortProcessInfo[];
  matchedService?: {
    projectId: string;
    projectName: string;
    serviceName: string;
    serviceType: string;
  };
  summary: string;
}

export class PortInspector {
  public static inspectPort(port: number, projectRepo?: ProjectRepository): PortInspectResult {
    const lsofBin = fs.existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : 'lsof';

    const res = spawnSync(lsofBin, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 64 * 1024
    });

    const processes: PortProcessInfo[] = [];

    if (res.status === 0 && res.stdout) {
      const lines = res.stdout.trim().split('\n');
      // Skip header line (COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const command = parts[0];
          const pid = parseInt(parts[1], 10);
          const user = parts[2];
          const fd = parts[3];
          const type = parts[4];
          const device = parts[5];
          const node = parts[7] || parts[6];
          const name = parts.slice(8).join(' ') || parts.slice(parts.length - 2).join(' ');
          processes.push({
            command,
            pid,
            user,
            fd,
            type,
            device,
            node,
            name
          });
        }
      }
    }

    // Deduplicate processes by PID
    const uniqueByPid = new Map<number, PortProcessInfo>();
    for (const p of processes) {
      if (!uniqueByPid.has(p.pid)) {
        uniqueByPid.set(p.pid, p);
      }
    }
    const uniqueProcesses = Array.from(uniqueByPid.values());

    // Check against registered projects/services
    let matchedService: PortInspectResult['matchedService'];
    if (projectRepo) {
      try {
        const projects = projectRepo.listProjects();
        for (const proj of projects) {
          if (proj.services) {
            for (const srv of proj.services) {
              if (srv.port === port) {
                matchedService = {
                  projectId: proj.id,
                  projectName: proj.displayName,
                  serviceName: srv.name,
                  serviceType: srv.serviceType
                };
                break;
              }
            }
          }
          if (matchedService) break;
        }
      } catch {
        // Ignore registry lookup errors
      }
    }

    if (uniqueProcesses.length === 0) {
      let summary = `Port ${port} par abhi koi process listen nahi kar raha hai (Port ${port} is free).`;
      if (matchedService) {
        summary += `\nYeh port **${matchedService.projectName}** ke service \`${matchedService.serviceName}\` ke liye configured hai, lekin abhi service active nahi hai.`;
      }
      return {
        port,
        inUse: false,
        processes: [],
        matchedService,
        summary
      };
    }

    const procDesc = uniqueProcesses
      .map((p) => `• **${p.command}** (PID: \`${p.pid}\`, User: \`${p.user}\`${p.name ? `, ${p.name}` : ''})`)
      .join('\n');

    let summary = `Port ${port} par process active hai:\n${procDesc}`;
    if (matchedService) {
      summary += `\n\nRegistered Service: **${matchedService.projectName}** → \`${matchedService.serviceName}\` (${matchedService.serviceType})`;
    }

    return {
      port,
      inUse: true,
      processes: uniqueProcesses,
      matchedService,
      summary
    };
  }
}
