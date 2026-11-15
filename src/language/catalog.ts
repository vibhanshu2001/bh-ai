export interface ActionDescriptor {
  id: string;
  intent: string;
  category: 'system' | 'app' | 'project' | 'service' | 'workflow' | 'folder';
  isExecutableInP2: boolean;
  requiresTarget: boolean;
  description: string;
}

export const ACTION_CATALOG: Record<string, ActionDescriptor> = {
  'system.memory.inspect': {
    id: 'system.memory.inspect',
    intent: 'system.memory_snapshot',
    category: 'system',
    isExecutableInP2: true,
    requiresTarget: false,
    description: 'Inspect macOS RAM and virtual memory metrics'
  },
  'system.cpu.inspect': {
    id: 'system.cpu.inspect',
    intent: 'system.cpu_snapshot',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Inspect macOS CPU load and process activity'
  },
  'system.disk.inspect': {
    id: 'system.disk.inspect',
    intent: 'system.disk_snapshot',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Inspect local disk usage and volumes'
  },
  'system.battery.inspect': {
    id: 'system.battery.inspect',
    intent: 'system.battery_snapshot',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Inspect MacBook battery and power status'
  },
  'app.launch': {
    id: 'app.launch',
    intent: 'app.launch',
    category: 'app',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Launch a registered macOS application'
  },
  'app.status': {
    id: 'app.status',
    intent: 'app.status',
    category: 'app',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Check if a macOS application is currently running'
  },
  'app.quit': {
    id: 'app.quit',
    intent: 'app.quit',
    category: 'app',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Quit a running macOS application'
  },
  'folder.open': {
    id: 'folder.open',
    intent: 'folder.open',
    category: 'folder',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Open a registered folder in Finder'
  },
  'port.inspect': {
    id: 'port.inspect',
    intent: 'port.inspect',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Check local listening port and owning process'
  },
  'process.inspect': {
    id: 'process.inspect',
    intent: 'process.inspect',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Inspect macOS running processes (ps aux)'
  },
  'process.kill': {
    id: 'process.kill',
    intent: 'process.kill',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Terminate a process by name or PID (Phase P4)'
  },
  'volume.set': {
    id: 'volume.set',
    intent: 'volume.set',
    category: 'system',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Set system audio volume'
  },
  'workspace.switch': {
    id: 'workspace.switch',
    intent: 'workspace.switch',
    category: 'workflow',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Switch active workspace configuration'
  },
  'project.onboard': {
    id: 'project.onboard',
    intent: 'project.onboard',
    category: 'project',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'Guided project onboarding wizard'
  },
  'project.list': {
    id: 'project.list',
    intent: 'project.list',
    category: 'project',
    isExecutableInP2: false,
    requiresTarget: false,
    description: 'List all registered projects'
  },
  'project.status': {
    id: 'project.status',
    intent: 'project.status',
    category: 'project',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Check registered project status'
  },
  'project.delete': {
    id: 'project.delete',
    intent: 'project.delete',
    category: 'project',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Remove project from Bhai registry'
  },
  'service.list': {
    id: 'service.list',
    intent: 'service.list',
    category: 'service',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'List services registered for project'
  },
  'project.test': {
    id: 'project.test',
    intent: 'project.test',
    category: 'project',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Run project test suite'
  },
  'service.start': {
    id: 'service.start',
    intent: 'service.start',
    category: 'service',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Start a registered service'
  },
  'service.stop': {
    id: 'service.stop',
    intent: 'service.stop',
    category: 'service',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Stop a registered service'
  },
  'service.logs': {
    id: 'service.logs',
    intent: 'service.logs',
    category: 'service',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'View service logs'
  },
  'project.diagnostic': {
    id: 'project.diagnostic',
    intent: 'project.diagnostic',
    category: 'service',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Diagnose why a service or project is failing'
  },
  'workflow.run': {
    id: 'workflow.run',
    intent: 'workflow.run',
    category: 'workflow',
    isExecutableInP2: false,
    requiresTarget: true,
    description: 'Run a saved multi-step routine'
  }
};

export interface CatalogEntity {
  id: string;
  name: string;
  kind: 'app' | 'project' | 'service' | 'workflow' | 'folder';
  aliases: string[];
  projectId?: string; // for services
}

export const KNOWN_ENTITIES: CatalogEntity[] = [
  {
    id: 'APP_VSC',
    name: 'Visual Studio Code',
    kind: 'app',
    aliases: ['vscode', 'vs code', 'code']
  },
  {
    id: 'APP_SAF',
    name: 'Safari',
    kind: 'app',
    aliases: ['safari']
  },
  {
    id: 'P_A',
    name: 'Aawas',
    kind: 'project',
    aliases: ['aawas', 'awas']
  },
  {
    id: 'P_P',
    name: 'Payments',
    kind: 'project',
    aliases: ['payments', 'office payments', 'pay']
  },
  {
    id: 'P_RD',
    name: 'Research and Development',
    kind: 'project',
    aliases: ['research and development', 'r&d', 'rnd']
  },
  {
    id: 'S_AB',
    name: 'Aawas Backend',
    kind: 'service',
    aliases: ['backend', 'server', 'api'],
    projectId: 'P_A'
  },
  {
    id: 'S_AF',
    name: 'Aawas Frontend',
    kind: 'service',
    aliases: ['frontend', 'web', 'ui'],
    projectId: 'P_A'
  },
  {
    id: 'W_OFFICE',
    name: 'Office Start',
    kind: 'workflow',
    aliases: ['office start', 'daily start']
  },
  {
    id: 'F_DOCS',
    name: 'Documents',
    kind: 'folder',
    aliases: ['documents', 'docs']
  },
  {
    id: 'W_WRAP',
    name: 'Wrap Up',
    kind: 'workflow',
    aliases: ['wrap up', 'daily wrap up']
  }
];
