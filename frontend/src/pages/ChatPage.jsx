import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, LifeBuoy, Loader2, MessageSquare, Plus, Search, Send, Users,
  Trash2, Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { authApi, chatApi } from '@/lib/api';
import { AVATAR_OPTIONS, avatarForSeed } from '@/lib/avatarOptions';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const STATUS_TONE = {
  Open: 'bg-blue-50 text-blue-700 border-blue-200',
  In_Progress: 'bg-amber-50 text-amber-700 border-amber-200',
  Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

function fmtTime(v) {
  return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

function avatarSeed(user) {
  return String(user?.avatarSeed || user?._id || user?.id || user?.email || user?.name || 'user');
}

function Avatar({ user, size = 'h-8 w-8' }) {
  const avatar = avatarForSeed(avatarSeed(user));
  return (
    <div
      className={cn(size, 'flex shrink-0 items-center justify-center rounded-full border bg-muted text-lg shadow-sm')}
      style={{ background: avatar.bg }}
      title={user?.name || avatar.label}
      aria-label={user?.name || avatar.label}
    >
      <span className="leading-none">{avatar.emoji}</span>
    </div>
  );
}

function myUserId(user) {
  return String(user?.id || user?._id || '');
}

function otherParticipants(conversation, user) {
  const mine = myUserId(user);
  return (conversation?.participants || []).filter(p => String(p._id || p.id) !== mine);
}

function isDirectChat(conversation) {
  return conversation?.kind === 'internal' && (conversation.participants || []).length <= 2;
}

function membersText(conversation, user) {
  if (!conversation) return '';
  if (conversation.kind === 'ticket') return `${conversation.ticket?.center?.name || 'Center'} - ${conversation.ticket?.priority || 'Normal'} priority`;
  const others = otherParticipants(conversation, user);
  if (isDirectChat(conversation)) return others[0]?.role || 'Team member';
  return `${(conversation.participants || []).length} members: ${(conversation.participants || []).map(p => p.name).join(', ')}`;
}

function titleFor(conversation, user) {
  if (!conversation) return '';
  if (conversation.kind === 'ticket') return conversation.ticket?.subject || conversation.title || 'Help Ticket';
  if (isDirectChat(conversation)) return otherParticipants(conversation, user)[0]?.name || 'Team Chat';
  return conversation.title || (conversation.participants || []).map(p => p.name).join(', ') || 'Team Chat';
}

function canDeleteConversation(conversation, user) {
  if (!conversation || conversation.kind !== 'internal') return false;
  if (user?.role === 'Admin') return true;
  return String(conversation.createdBy?._id || conversation.createdBy) === String(user?.id || user?._id);
}

export default function ChatPage() {
  const { user, updateUser } = useAuth();
  const isCenter = user?.role === 'Center';
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [teamUsers, setTeamUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [chatForm, setChatForm] = useState({ title: '', participantIds: [] });
  const [ticketForm, setTicketForm] = useState({ subject: '', priority: 'Normal', message: '' });
  const bottomRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const rows = await chatApi.conversations();
    setConversations(rows);
    setActiveId(prev => prev || rows[0]?._id || '');
    return rows;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [rows, users] = await Promise.all([
          loadConversations(),
          isCenter ? Promise.resolve([]) : chatApi.users(),
        ]);
        setTeamUsers(users);
        if (rows[0]?._id) setActiveId(prev => prev || rows[0]._id);
      } catch (e) {
        toast.error(e.message || 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    })();
  }, [isCenter, loadConversations]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return undefined; }
    let cancelled = false;
    async function loadMessages() {
      try {
        const rows = await chatApi.messages(activeId);
        if (!cancelled) setMessages(rows);
      } catch (e) {
        if (!cancelled) toast.error(e.message || 'Failed to load messages');
      }
    }
    loadMessages();
    const iv = setInterval(loadMessages, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeId]);

  const active = conversations.find(c => c._id === activeId);
  const myId = String(user?.id || user?._id || '');
  const ticketWaitingForAccept = isCenter && active?.kind === 'ticket' && active.ticket?.status === 'Open';
  const chatLocked = active?.kind === 'ticket' && (active.ticket?.status === 'Closed' || ticketWaitingForAccept);
  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => conversations.filter(c => {
    if (!q) return true;
    return [
      titleFor(c, user),
      c.kind,
      c.ticket?.status,
      c.ticket?.center?.name,
      c.lastMessagePreview,
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [conversations, q, user]);

  async function createChat() {
    if (chatForm.participantIds.length === 0) return toast.error('Select at least one team member');
    if (chatForm.participantIds.length > 1 && !chatForm.title.trim()) return toast.error('Group name required');
    setSaving(true);
    try {
      const conversation = await chatApi.createChat(chatForm);
      toast.success('Chat created');
      setNewChatOpen(false);
      setChatForm({ title: '', participantIds: [] });
      await loadConversations();
      setActiveId(conversation._id);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function createTicket() {
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) return toast.error('Subject and message required');
    setSaving(true);
    try {
      const conversation = await chatApi.createTicket(ticketForm);
      toast.success('Ticket raised');
      setTicketOpen(false);
      setTicketForm({ subject: '', priority: 'Normal', message: '' });
      await loadConversations();
      setActiveId(conversation._id);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage() {
    if (!activeId || !message.trim()) return;
    const current = conversations.find(c => c._id === activeId);
    if (current?.kind === 'ticket' && current.ticket?.status === 'Open' && isCenter) return toast.error('Counselor must accept this ticket before chat starts');
    if (current?.kind === 'ticket' && current.ticket?.status === 'Closed') return toast.error('Ticket is closed');
    const body = message.trim();
    setMessage('');
    try {
      const saved = await chatApi.sendMessage(activeId, body);
      setMessages(prev => [...prev, saved]);
      loadConversations().catch(() => {});
    } catch (e) {
      setMessage(body);
      toast.error(e.message);
    }
  }

  function openStatusDialog(status) {
    setStatusNote('');
    setStatusDialog({ status });
  }

  async function updateTicket(status, data = {}) {
    if (!active) return;
    setSaving(true);
    try {
      const updated = await chatApi.updateTicket(active._id, status, data);
      setConversations(prev => prev.map(c => c._id === updated._id ? updated : c));
      toast.success(status === 'In_Progress' ? 'Ticket accepted' : `Ticket marked ${status.replace(/_/g, ' ')}`);
      const rows = await chatApi.messages(active._id);
      setMessages(rows);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitTicketStatus() {
    if (!statusDialog || !active) return;
    const text = statusNote.trim();
    const closingUnresolved = statusDialog.status === 'Closed' && active.ticket?.status !== 'Resolved' && !active.ticket?.resolvedAt;
    if (statusDialog.status === 'Resolved' && !text) return toast.error('Resolution details required');
    if (closingUnresolved && !text) return toast.error('Close reason required for unresolved ticket');
    const payload = closingUnresolved ? { reason: text } : { note: text };
    const ok = await updateTicket(statusDialog.status, payload);
    if (ok) {
      setStatusDialog(null);
      setStatusNote('');
    }
  }

  async function chooseAvatar(seed) {
    setSaving(true);
    try {
      const res = await authApi.updateAvatar(seed);
      updateUser?.(res.user);
      toast.success('Avatar updated');
      setAvatarOpen(false);
      await loadConversations();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteChat(conversation) {
    if (!conversation || conversation.kind !== 'internal') return;
    if (!confirm(`Delete "${titleFor(conversation, user)}"? All messages in this group will be removed.`)) return;
    setSaving(true);
    try {
      await chatApi.deleteChat(conversation._id);
      toast.success('Chat deleted');
      const rows = await loadConversations();
      setActiveId(rows[0]?._id || '');
      setMessages([]);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleUser(id) {
    setChatForm(prev => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter(v => v !== id)
        : [...prev.participantIds, id],
    }));
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {isCenter ? <LifeBuoy className="h-5 w-5"/> : <MessageSquare className="h-5 w-5"/>}
            {isCenter ? 'Help & Tickets' : 'Team Chat'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCenter ? 'Raise issues and chat with your assigned counselor.' : 'Internal chat for admin, counselors, accountant, university and dispatch teams.'}
          </p>
        </div>
        {isCenter ? (
          <Button onClick={() => setTicketOpen(true)}><Plus className="h-4 w-4 mr-1"/>Raise Ticket</Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAvatarOpen(true)}><Palette className="h-4 w-4 mr-1"/>Choose Avatar</Button>
            <Button onClick={() => setNewChatOpen(true)}><Plus className="h-4 w-4 mr-1"/>New Chat</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] h-[calc(100vh-220px)] min-h-[380px]">
        <div className="rounded-lg border bg-card overflow-hidden flex min-h-0 flex-col">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={isCenter ? 'Search tickets...' : 'Search chats...'} className="pl-9"/>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {isCenter ? 'No tickets yet' : 'No chats yet'}
              </div>
            ) : filtered.map(c => {
              const other = otherParticipants(c, user)[0] || (c.participants || [])[0];
              return (
              <button
                key={c._id}
                onClick={() => setActiveId(c._id)}
                className={cn(
                  'w-full text-left border-b px-3 py-3 hover:bg-accent transition-colors',
                  activeId === c._id && 'bg-accent'
                )}
              >
                <div className="flex items-start gap-2">
                  {c.kind === 'internal' && !isDirectChat(c) ? (
                    <div className="flex -space-x-2 pt-0.5">
                      {(c.participants || []).slice(0, 3).map(p => <Avatar key={p._id || p.id} user={p} size="h-8 w-8" />)}
                    </div>
                  ) : (
                    <Avatar user={c.kind === 'ticket' ? c.ticket?.assignedTo || other : other} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm line-clamp-1">{titleFor(c, user)}</div>
                      {c.kind === 'ticket' && <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[c.ticket?.status])}>{c.ticket?.status?.replace(/_/g, ' ')}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {membersText(c, user)}
                    </div>
                    {c.lastMessagePreview && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.lastMessagePreview}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">{fmtTime(c.lastMessageAt || c.updatedAt)}</div>
                  </div>
                </div>
              </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card flex min-h-0 flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {isCenter ? 'Raise a ticket to start help chat.' : 'Select or create a chat.'}
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {active.kind === 'ticket' && (
                        <Avatar user={active.ticket?.assignedTo || active.participants?.[0]} size="h-9 w-9" />
                      )}
                      {active.kind === 'internal' && isDirectChat(active) && (
                        <Avatar user={otherParticipants(active, user)[0] || active.participants?.[0]} size="h-9 w-9" />
                      )}
                      {active.kind === 'internal' && !isDirectChat(active) && (
                        <div className="flex -space-x-2">
                          {(active.participants || []).slice(0, 4).map(p => <Avatar key={p._id || p.id} user={p} size="h-7 w-7" />)}
                        </div>
                      )}
                      <div>
                        {active.kind === 'ticket' && <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Help Ticket</div>}
                        <div className="font-semibold">{titleFor(active, user)}</div>
                        {active.kind === 'ticket' ? (
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border bg-slate-50 px-2 py-0.5 text-slate-600">{active.ticket?.center?.name || 'Center'}</span>
                            <span className="rounded-full border bg-amber-50 px-2 py-0.5 text-amber-700">Priority: {active.ticket?.priority || 'Normal'}</span>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {membersText(active, user)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {canDeleteConversation(active, user) && (
                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => deleteChat(active)} disabled={saving}>
                      <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                    </Button>
                  )}
                  {active.kind === 'ticket' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', STATUS_TONE[active.ticket?.status])}>Status: {active.ticket?.status?.replace(/_/g, ' ')}</span>
                      {!isCenter && active.ticket?.status === 'Open' && <Button size="sm" onClick={() => updateTicket('In_Progress')} disabled={saving}>Accept</Button>}
                      {!isCenter && ['Open', 'In_Progress'].includes(active.ticket?.status) && <Button size="sm" variant="outline" onClick={() => openStatusDialog('Resolved')} disabled={saving}><CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Resolve</Button>}
                      {active.ticket?.status !== 'Closed' && <Button size="sm" variant="outline" onClick={() => openStatusDialog('Closed')} disabled={saving}>Close</Button>}
                    </div>
                  )}
                </div>
                {active.kind === 'ticket' && (active.ticket?.resolutionNote || active.ticket?.closeReason || active.ticket?.closeNote || active.ticket?.closedAt) && (
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    {active.ticket?.resolutionNote && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                        <div className="font-semibold">Resolution Details</div>
                        <div className="mt-1 whitespace-pre-wrap">{active.ticket.resolutionNote}</div>
                        {active.ticket?.resolvedAt && <div className="mt-1 text-emerald-700">Resolved at {fmtTime(active.ticket.resolvedAt)}</div>}
                        {active.ticket?.resolvedBy?.name && <div className="mt-1 text-emerald-700">By {active.ticket.resolvedBy.name}</div>}
                      </div>
                    )}
                    {active.ticket?.closedAt && (
                      <div className={cn(
                        'rounded-lg border px-3 py-2',
                        active.ticket?.closedWithoutResolution ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'
                      )}>
                        <div className="font-semibold">{active.ticket?.closedWithoutResolution ? 'Closed Without Resolution' : 'Close Details'}</div>
                        {(active.ticket?.closeReason || active.ticket?.closeNote) && <div className="mt-1 whitespace-pre-wrap">{active.ticket.closeReason || active.ticket.closeNote}</div>}
                        <div className="mt-1">Closed at {fmtTime(active.ticket.closedAt)}</div>
                        {active.ticket?.closedBy?.name && <div className="mt-1">By {active.ticket.closedBy.name}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-muted/20">
                {ticketWaitingForAccept ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-md rounded-xl border bg-card px-5 py-4 text-center shadow-sm">
                      <div className="text-sm font-semibold">Waiting for counselor acceptance</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Your ticket has been raised. Chat will open here after your assigned counselor accepts it.
                      </div>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">No messages yet</div>
                ) : messages.map(m => {
                  const mine = String(m.sender?._id || m.sender) === myId;
                  return (
                    <div key={m._id} className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                      {!mine && <Avatar user={m.sender} size="h-8 w-8" />}
                      <div className={cn('max-w-[78%] rounded-lg border px-3 py-2 shadow-sm', mine ? 'bg-primary text-primary-foreground border-primary' : 'bg-card')}>
                        <div className={cn('text-[11px] mb-1', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                          {m.sender?.name || 'User'} - {m.sender?.role || ''} - {fmtTime(m.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</div>
                      </div>
                      {mine && <Avatar user={m.sender || user} size="h-8 w-8" />}
                    </div>
                  );
                })}
                <div ref={bottomRef}/>
              </div>

              <div className="border-t p-3">
                <div className="flex gap-2">
                  <Textarea
                    rows={2}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={chatLocked}
                    placeholder={ticketWaitingForAccept ? 'Waiting for counselor to accept...' : active.kind === 'ticket' && active.ticket?.status === 'Closed' ? 'Ticket is closed' : 'Type your message...'}
                  />
                  <Button onClick={sendMessage} disabled={!message.trim() || chatLocked} className="self-end">
                    <Send className="h-4 w-4"/>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Team Chat</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Group name</Label>
              <Input
                value={chatForm.title}
                onChange={e => setChatForm(p => ({ ...p, title: e.target.value }))}
                placeholder={chatForm.participantIds.length > 1 ? 'Required for group' : 'Direct chat uses member name'}
              />
              <p className="text-xs text-muted-foreground mt-1">Select one member for direct chat. Select multiple members to create a group.</p>
            </div>
            <div>
              <Label>Team members</Label>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border divide-y">
                {teamUsers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No team users found</div>
                ) : teamUsers.map(u => (
                  <label key={u._id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent">
                    <input type="checkbox" checked={chatForm.participantIds.includes(u._id)} onChange={() => toggleUser(u._id)}/>
                    <Avatar user={u} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.role} - {u.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>Cancel</Button>
            <Button onClick={createChat} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise Help Ticket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Subject *</Label><Input value={ticketForm.subject} onChange={e => setTicketForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Payment verification issue"/></div>
            <div>
              <Label>Priority</Label>
              <Select value={ticketForm.priority} onValueChange={v => setTicketForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {['Low', 'Normal', 'High', 'Urgent'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Message *</Label><Textarea rows={5} value={ticketForm.message} onChange={e => setTicketForm(p => ({ ...p, message: e.target.value }))} placeholder="Describe the issue clearly..."/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>Cancel</Button>
            <Button onClick={createTicket} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Submit Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusDialog)} onOpenChange={open => {
        if (!open) {
          setStatusDialog(null);
          setStatusNote('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.status === 'Resolved'
                ? 'Resolve Ticket'
                : active?.ticket?.status === 'Resolved' || active?.ticket?.resolvedAt
                  ? 'Close Ticket'
                  : 'Close Without Resolution'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>
              {statusDialog?.status === 'Resolved'
                ? 'Resolution details *'
                : active?.ticket?.status === 'Resolved' || active?.ticket?.resolvedAt
                  ? 'Close note'
                  : 'Reason *'}
            </Label>
            <Textarea
              rows={5}
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
              placeholder={
                statusDialog?.status === 'Resolved'
                  ? 'Write what solution was given...'
                  : active?.ticket?.status === 'Resolved' || active?.ticket?.resolvedAt
                    ? 'Optional final close note...'
                    : 'Write proper reason why this ticket is being closed without resolution...'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button>
            <Button onClick={submitTicketStatus} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Choose Avatar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {AVATAR_OPTIONS.map(opt => {
              const selected = (user?.avatarSeed || '') === opt.seed;
              return (
                <button
                  key={opt.seed}
                  type="button"
                  onClick={() => chooseAvatar(opt.seed)}
                  disabled={saving}
                  className={cn(
                    'rounded-lg border p-3 text-center transition hover:bg-accent',
                    selected && 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  )}
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border bg-muted text-3xl shadow-sm" style={{ background: opt.bg }}>
                    <span className="leading-none">{opt.emoji}</span>
                  </div>
                  <div className="mt-2 text-xs font-medium">{opt.label}</div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvatarOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
