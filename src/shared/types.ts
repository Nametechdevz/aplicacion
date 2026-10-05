import type { Role, Permission } from './permissions';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'qr_required' | 'error';
export type ProviderKind = 'cloud_api' | 'simulator';

export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled' | 'received';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'template' | 'location' | 'contacts' | 'interactive' | 'reaction' | 'unknown';
export type ConsentStatus = 'unknown' | 'opted_in' | 'opted_out';
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type AudienceType = 'all' | 'tag' | 'segment' | 'import' | 'manual';

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  permissions: Permission[];
}

export interface WhatsAppAccount {
  id: number;
  name: string;
  provider: ProviderKind;
  phone_number: string | null;
  display_name: string | null;
  status: ConnectionStatus;
  status_detail: string | null;
  last_connected_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  has_credentials: boolean;
  quality_rating?: string | null;
  qr?: string | null;
}

export interface Tag {
  id: number;
  account_id: number;
  name: string;
  color: string;
  emoji: string | null;
  is_system: number;
  system_key: string | null;
  contact_count?: number;
}

export interface CustomField {
  id: number;
  account_id: number;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[] | null;
  position: number;
}

export interface Contact {
  id: number;
  account_id: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  avatar_path: string | null;
  status: 'active' | 'archived';
  assigned_to: number | null;
  assigned_name?: string | null;
  consent_status: ConsentStatus;
  consent_source: string | null;
  consent_date: string | null;
  blacklisted: number;
  blacklist_reason: string | null;
  source: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  custom?: Record<string, string | null>;
  stage?: { pipeline_id: number; stage_id: number; stage_name: string; color: string } | null;
}

export interface ContactFilter {
  search?: string;
  tagIds?: number[];
  tagMode?: 'any' | 'all';
  excludeTagIds?: number[];
  segmentId?: number;
  consent?: ConsentStatus;
  blacklisted?: boolean;
  assignedTo?: number | null;
  status?: 'active' | 'archived';
  limit?: number;
  offset?: number;
  sort?: 'name' | 'created_at' | 'last_message_at';
  sortDir?: 'asc' | 'desc';
}

export type SegmentField =
  | 'tag' | 'name' | 'phone' | 'email' | 'company' | 'last_message_at' | 'last_inbound_at' | 'created_at'
  | 'consent_status' | 'status' | 'assigned_to' | 'custom_field' | 'pipeline_stage' | 'campaign_received' | 'replied';

export type SegmentOp =
  | 'is' | 'is_not' | 'contains' | 'not_contains' | 'starts_with' | 'equals' | 'not_equals'
  | 'older_than_days' | 'within_days' | 'before' | 'after' | 'is_empty' | 'not_empty' | 'gt' | 'lt';

export interface SegmentRule {
  field: SegmentField;
  op: SegmentOp;
  value?: string | number | null;
  fieldKey?: string; // para custom_field
}

export interface SegmentDefinition {
  match: 'all' | 'any';
  rules: SegmentRule[];
}

export interface Segment {
  id: number;
  account_id: number;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  created_at: string;
  contact_count?: number;
}

export interface Conversation {
  id: number;
  account_id: number;
  contact_id: number;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: 'in' | 'out' | null;
  assigned_to: number | null;
  status: 'open' | 'closed';
  bot_paused_until: string | null;
  awaiting_reply: number;
  contact_name: string | null;
  contact_phone: string;
  tags?: Tag[];
}

export interface MediaRef {
  id: number;
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  file_name: string;
  mime_type: string;
  size: number;
}

export interface Message {
  id: number;
  account_id: number;
  conversation_id: number;
  contact_id: number;
  direction: 'in' | 'out';
  type: MessageType;
  body: string | null;
  status: MessageStatus;
  source: 'manual' | 'campaign' | 'automation' | 'ai' | 'scheduled' | 'system' | 'inbound';
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  campaign_id: number | null;
  sent_by_user_id: number | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  media?: MediaRef | null;
  template_name?: string | null;
}

export interface MediaItem {
  id: number;
  account_id: number;
  kind: 'image' | 'video' | 'audio' | 'document';
  file_name: string;
  mime_type: string;
  size: number;
  title: string | null;
  created_at: string;
  usage_count?: number;
}

export interface Template {
  id: number;
  account_id: number;
  name: string;
  category: string;
  body: string;
  media_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReply {
  id: number;
  account_id: number;
  shortcut: string;
  body: string;
  media_id: number | null;
}

export interface ProviderTemplate {
  id: number;
  account_id: number;
  name: string;
  language: string;
  category: string | null;
  status: string;
  body_text: string | null;
  param_count: number;
  header_type: string | null;
  synced_at: string;
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  byWeekday?: number[]; // 1=lunes … 7=domingo (ISO)
  byMonthDay?: number;
  time: string; // HH:mm
  until?: string | null; // ISO date
  maxRuns?: number | null;
}

export interface AudienceSpec {
  type: AudienceType;
  tagIds?: number[];
  tagMode?: 'any' | 'all';
  segmentId?: number;
  importBatchId?: string;
  contactIds?: number[];
}

export interface Campaign {
  id: number;
  account_id: number;
  name: string;
  status: CampaignStatus;
  audience: AudienceSpec;
  message_type: 'text' | 'template';
  body: string | null;
  media_id: number | null;
  provider_template_id: number | null;
  template_params: string[] | null;
  timezone: string;
  scheduled_at: string | null;
  recurrence: Recurrence | null;
  next_run_at: string | null;
  confirmed_count: number | null;
  confirmed_at: string | null;
  pause_reason: string | null;
  last_error: string | null;
  created_by: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  run_count: number;
  stats?: CampaignStats;
}

export interface CampaignStats {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  cancelled: number;
  skipped: number;
  pending: number;
}

export interface AudiencePreview {
  total: number;
  eligible: number;
  excluded: { opted_out: number; blacklisted: number; no_contact_tag: number; invalid_phone: number; duplicates: number; outside_window: number };
  sample: { contact_id: number; name: string | null; phone: string; text: string; missing: string[] }[];
}

export type AutomationNodeType = 'trigger' | 'condition' | 'action';

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  subtype: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'true' | 'false' | 'next' | null;
}

export interface Automation {
  id: number;
  account_id: number;
  name: string;
  description: string | null;
  enabled: number;
  trigger_type: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  account_id: number;
  contact_id: number | null;
  contact_name?: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  status: 'pending' | 'done' | 'cancelled';
  assigned_to: number | null;
  assigned_name?: string | null;
  source: string;
  created_at: string;
  completed_at: string | null;
}

export interface Note {
  id: number;
  contact_id: number;
  body: string;
  created_by: number | null;
  author_name?: string | null;
  created_at: string;
}

export interface BusinessHours {
  timezone: string;
  days: Record<string, { enabled: boolean; open: string; close: string }>; // '1'..'7'
  outOfHoursReply: { enabled: boolean; message: string; cooldownHours: number };
}

export interface AppEvent {
  type: string;
  data?: any;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
