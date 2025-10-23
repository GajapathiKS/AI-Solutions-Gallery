import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { TextDecoder } from 'node:util';

export interface McpClientOptions {
  command: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  debug?: boolean;
}

export interface ToolCallArguments {
  name: string;
  arguments?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const decoder = new TextDecoder();

export class McpClient extends EventEmitter {
  private readonly options: McpClientOptions;
  private proc?: ChildProcessWithoutNullStreams;
  private buffer: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private closing = false;

  constructor(options: McpClientOptions) {
    super();
    if (!options.command || options.command.length === 0) {
      throw new Error('Command is required to start MCP client');
    }
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.proc) {
      return;
    }
    const [command, ...args] = this.options.command;
    this.proc = spawn(command, args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', chunk => this.handleData(chunk));
    this.proc.stderr.on('data', chunk => {
      if (this.options.debug) {
        process.stderr.write(chunk);
      }
    });
    this.proc.on('exit', code => {
      if (!this.closing) {
        this.emit('exit', code ?? 0);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.proc) {
      return;
    }
    this.closing = true;
    const proc = this.proc;
    this.proc = undefined;
    proc.stdin.end();
    proc.kill();
    this.pending.forEach(({ reject }) => reject(new Error('MCP client closed')));
    this.pending.clear();
  }

  async initialize(clientName: string, clientVersion: string): Promise<unknown> {
    return this.request('initialize', {
      clientInfo: { name: clientName, version: clientVersion },
      protocolVersion: '2024-05-03'
    });
  }

  async callTool(args: ToolCallArguments): Promise<any> {
    return this.request('tools/call', {
      name: args.name,
      arguments: args.arguments ?? {}
    });
  }

  async request(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.proc || !this.proc.stdin) {
      throw new Error('MCP client not started');
    }
    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {})
    };
    const json = Buffer.from(JSON.stringify(payload), 'utf-8');
    const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, 'utf-8');
    this.proc.stdin.write(header);
    this.proc.stdin.write(json);
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      let separatorIndex = this.buffer.indexOf('\r\n\r\n');
      let separatorLength = 4;
      if (separatorIndex === -1) {
        separatorIndex = this.buffer.indexOf('\n\n');
        separatorLength = 2;
      }
      if (separatorIndex === -1) {
        return;
      }
      const header = decoder.decode(this.buffer.slice(0, separatorIndex + separatorLength));
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        throw new Error(`Invalid MCP header: ${header}`);
      }
      const length = Number(match[1]);
      const total = separatorIndex + separatorLength + length;
      if (this.buffer.length < total) {
        return;
      }
      const body = this.buffer.slice(separatorIndex + separatorLength, total);
      this.buffer = this.buffer.slice(total);
      const text = decoder.decode(body);
      const message = JSON.parse(text);
      this.dispatch(message);
    }
  }

  private dispatch(message: any): void {
    if (typeof message?.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || 'MCP error');
        (error as any).code = message.error.code;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    const method = message?.method;
    if (method) {
      this.emit(method, message.params ?? {});
    }
  }
}
