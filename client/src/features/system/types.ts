export type Health = 'ok' | 'warn' | 'down';
export type ComponentHealth = { status: Health; uptime: string; response: string; version: string; days: ('' | 'warn' | 'down')[] };
export type Incident = { at: string; title: string; text: string };
export type AiModelInfo = { name: string; trainedAt: string; accuracy: string; meanError: string; inputs: number; predictionsToday: number };
export type SystemHealth = { checkedAt: string | null; components: Partial<Record<string, ComponentHealth>>; incidents: Incident[]; model: AiModelInfo | null };
export type DashboardSummary = { stations: number | null; records: number | null; calculationsToday: number | null };
