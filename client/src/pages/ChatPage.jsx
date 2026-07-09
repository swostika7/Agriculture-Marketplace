/**
 * ChatPage.jsx — Full-featured chat with:
 *  • Send text messages
 *  • Send images and files (up to 10 MB)
 *  • Edit own messages (text only)
 *  • Delete own messages (soft-delete)
 *  • Real-time via Socket.IO with deduplication
 *  • Unread badges and incoming toast
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MdSend, MdChat, MdArrowBack, MdFiberManualRecord, MdClose,
  MdNotificationsActive, MdAttachFile, MdImage, MdEdit, MdDelete,
  MdCheck, MdMoreVert, MdDownload, MdInsertDriveFile,
} from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { chatAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

function Avatar({ user, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  if (user?.avatar) return <img src={user.avatar} alt="" className={`${sz} rounded-full object-cover ring-2 ring-leaf-200 shrink-0`}/>;
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-leaf-300 to-leaf-600 flex items-center justify-center text-white font-bold shrink-0`}>
      {user?.name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function formatFullTime(d) {
  return new Date(d).toLocaleString('en-US', {
    hour:'2-digit', minute:'2-digit', hour12:true,
    day:'numeric', month:'short', year:'numeric',
  });
}

function getDateKey(d) {
  const now  = new Date();
  const date = new Date(d);
  if (date.toDateString() === now.toDateString()) return 'today';
  const yest = new Date(now); yest.setDate(yest.getDate()-1);
  if (date.toDateString() === yest.toDateString()) return 'yesterday';
  return date.toDateString();
}

function formatSeparator(k) {
  if (k === 'today')     return 'Today';
  if (k === 'yesterday') return 'Yesterday';
  return new Date(k).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

/* ── File / Image attachment display ── */
function FileAttachment({ msg, isMe }) {
  if (!msg.fileURL) return null;
  const url = msg.fileURL.startsWith('/uploads') ? `${SERVER}${msg.fileURL}` : msg.fileURL;
  if (msg.fileType === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={msg.fileName||'image'} className="max-w-[240px] rounded-xl object-cover border border-white/20 hover:opacity-90 transition-opacity"/>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" download
      className={`flex items-center gap-2 mt-1 px-3 py-2 rounded-xl border transition-colors
        ${isMe ? 'border-white/30 bg-white/10 hover:bg-white/20 text-white' : 'border-earth-200 bg-earth-50 hover:bg-earth-100 text-earth-700'}`}>
      <MdInsertDriveFile size={20} className={isMe?'text-white':'text-leaf-500'}/>
      <span className="text-xs font-body flex-1 truncate max-w-[180px]">{msg.fileName||'File'}</span>
      <MdDownload size={16}/>
    </a>
  );
}

/* ── Individual message bubble with edit/delete ── */
function MessageBubble({ msg, isMe, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [editText, setEditText] = useState(msg.text);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (msg.deleted) {
    return (
      <div className={`flex items-end gap-2 mt-2 ${isMe ? 'flex-row-reverse' : ''}`}>
        {!isMe && <div className="w-8 h-8 rounded-full shrink-0"/>}
        <div className={`px-4 py-2 rounded-2xl text-xs font-body italic opacity-50
          ${isMe ? 'bg-leaf-300 text-white rounded-br-md' : 'bg-earth-100 text-earth-500 rounded-bl-md'}`}>
          🗑 This message was deleted
        </div>
      </div>
    );
  }

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== msg.text) onEdit(msg._id, editText.trim());
    setEditing(false);
  };

  return (
    <div className={`flex items-end gap-2 mt-2 ${isMe ? 'flex-row-reverse' : ''}`}>
      {!isMe && <Avatar user={msg.senderID} size="sm"/>}
      <div className={`relative group max-w-[72%]`}>
        {/* Edit/delete menu — only for sender */}
        {isMe && !editing && (
          <div className={`absolute top-1 ${isMe ? 'left-0 -translate-x-full pl-0 pr-2' : 'right-0 translate-x-full pl-2'} flex items-center opacity-0 group-hover:opacity-100 transition-opacity z-10`} ref={menuRef}>
            <div className="flex flex-col gap-0.5 bg-white shadow-lg rounded-xl border border-earth-100 overflow-hidden">
              <button onClick={() => { setEditing(true); setEditText(msg.text); setMenuOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-earth-600 hover:bg-earth-50 whitespace-nowrap">
                <MdEdit size={13}/> Edit
              </button>
              <button onClick={() => { onDelete(msg._id); setMenuOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 hover:bg-red-50 whitespace-nowrap">
                <MdDelete size={13}/> Delete
              </button>
            </div>
          </div>
        )}

        {/* Bubble */}
        <div className={`px-4 py-2.5 rounded-2xl shadow-sm
          ${isMe ? 'bg-leaf-500 text-white rounded-br-md' : 'bg-white text-earth-800 rounded-bl-md border border-earth-100'}`}>

          {/* File attachment */}
          <FileAttachment msg={msg} isMe={isMe}/>

          {/* Text — or edit input */}
          {editing ? (
            <div className="flex items-end gap-1 mt-1">
              <textarea
                className="input text-sm resize-none w-full min-w-[160px]"
                value={editText}
                rows={2}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSaveEdit();} if(e.key==='Escape')setEditing(false); }}
                autoFocus
              />
              <div className="flex flex-col gap-1">
                <button onClick={handleSaveEdit} className="p-1.5 rounded-lg bg-leaf-500 text-white hover:bg-leaf-600"><MdCheck size={14}/></button>
                <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg bg-earth-100 text-earth-500 hover:bg-earth-200"><MdClose size={14}/></button>
              </div>
            </div>
          ) : (
            msg.text && <p className="text-sm font-body leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          )}

          {/* Timestamp row */}
          <p className={`text-[10px] mt-1.5 leading-none flex items-center gap-1 ${isMe ? 'text-leaf-200 justify-end' : 'text-earth-400'}`}>
            {msg.edited && <span className="italic">(edited)</span>}
            {formatFullTime(msg.createdAt)}
            {isMe && <span>{msg.read ? '✓✓' : '✓'}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── File preview before send ── */
function FilePreview({ file, previewUrl, onRemove }) {
  if (!file) return null;
  const isImage = file.type.startsWith('image/');
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-earth-50 border-t border-earth-100">
      {isImage
        ? <img src={previewUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-earth-200"/>
        : <div className="w-14 h-14 rounded-xl bg-earth-100 flex items-center justify-center"><MdInsertDriveFile size={28} className="text-earth-400"/></div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-body text-earth-700 truncate">{file.name}</p>
        <p className="text-xs text-earth-400">{(file.size/1024/1024).toFixed(2)} MB</p>
      </div>
      <button onClick={onRemove} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><MdClose size={18}/></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function ChatPage() {
  const { user }    = useAuth();
  const { t, lang } = useLanguage();
  const { socket }  = useSocket();
  const [searchParams] = useSearchParams();

  const [convs,         setConvs]        = useState([]);
  const [activeConv,    setActiveConv]   = useState(null);
  const [messages,      setMessages]     = useState([]);
  const [newMsg,        setNewMsg]       = useState('');
  const [loadingConvs,  setLoadingConvs] = useState(true);
  const [loadingMsgs,   setLoadingMsgs]  = useState(false);
  const [sending,       setSending]      = useState(false);
  const [incomingToast, setIncomingToast]= useState(null);
  const [unreadConvs,   setUnreadConvs]  = useState({});

  // File attachment state
  const [attachFile,    setAttachFile]   = useState(null);   // File object
  const [previewUrl,    setPreviewUrl]   = useState('');
  const fileInputRef = useRef(null);

  const renderedIds   = useRef(new Set());
  const bottomRef     = useRef(null);
  const inputRef      = useRef(null);
  const activeConvRef = useRef(null);

  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // Load conversations
  useEffect(() => {
    const autoOpen = searchParams.get('autoOpen');
    chatAPI.getConversations()
      .then(({ data }) => {
        setConvs(data);
        const unread = {};
        data.forEach(c => { if (c.unreadCount?.[user._id] > 0) unread[c._id] = c.unreadCount[user._id]; });
        setUnreadConvs(unread);
        if (autoOpen === 'newest' && data.length > 0) setActiveConv(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [user._id]); // eslint-disable-line

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConv) return;
    renderedIds.current.clear();
    setMessages([]);
    setLoadingMsgs(true);
    chatAPI.getMessages(activeConv._id)
      .then(({ data }) => {
        data.forEach(m => renderedIds.current.add(m._id));
        setMessages(data);
        setUnreadConvs(prev => { const n={...prev}; delete n[activeConv._id]; return n; });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 100);
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
    if (socket) {
      socket.emit('join_conversation', activeConv._id);
      socket.emit('mark_read', { conversationID: activeConv._id });
    }
  }, [activeConv?._id, socket]); // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages.length]);

  // Socket: new message
  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      const id = msg._id?.toString();
      if (renderedIds.current.has(id)) return;
      renderedIds.current.add(id);
      const curr = activeConvRef.current;
      if (curr && msg.conversationID === curr._id) {
        setMessages(prev => [...prev, msg]);
        socket.emit('mark_read', { conversationID: curr._id });
        if (msg.senderID?._id !== user._id) {
          setIncomingToast({ name:msg.senderID?.name, text:msg.text||'📎 File', convId:curr._id });
          setTimeout(() => setIncomingToast(null), 4000);
        }
      } else {
        if (msg.senderID?._id !== user._id) {
          setUnreadConvs(prev => ({ ...prev, [msg.conversationID]:(prev[msg.conversationID]||0)+1 }));
          setIncomingToast({ name:msg.senderID?.name, text:msg.text||'📎 File', convId:msg.conversationID });
          setTimeout(() => setIncomingToast(null), 4000);
        }
      }
      setConvs(prev => prev.map(c => c._id===msg.conversationID?{...c,lastMessage:msg.text||'📎 File'}:c));
    };
    socket.on('new_message', handler);
    return () => socket.off('new_message', handler);
  }, [socket, user._id]);

  // Socket: message edited
  useEffect(() => {
    if (!socket) return;
    const handler = (updated) => {
      setMessages(prev => prev.map(m => m._id===updated._id ? updated : m));
    };
    socket.on('message_edited', handler);
    return () => socket.off('message_edited', handler);
  }, [socket]);

  // Socket: message deleted
  useEffect(() => {
    if (!socket) return;
    const handler = ({ messageID }) => {
      setMessages(prev => prev.map(m => m._id===messageID ? {...m, deleted:true, text:'', fileURL:'', fileName:''} : m));
    };
    socket.on('message_deleted', handler);
    return () => socket.off('message_deleted', handler);
  }, [socket]);

  // Socket: conv_update
  useEffect(() => {
    if (!socket) return;
    const handler = ({ conversationID, lastMessage }) => {
      setConvs(prev => prev.map(c => c._id===conversationID?{...c,lastMessage}:c));
    };
    socket.on('conv_update', handler);
    return () => socket.off('conv_update', handler);
  }, [socket]);

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('File too large — max 10 MB'); return; }
    setAttachFile(file);
    if (file.type.startsWith('image/')) setPreviewUrl(URL.createObjectURL(file));
    else setPreviewUrl('');
    e.target.value = '';
  };

  const removeAttachment = () => { setAttachFile(null); setPreviewUrl(''); };

  // Send message (text + optional file)
  const sendMessage = useCallback(async () => {
    if ((!newMsg.trim() && !attachFile) || !activeConv || sending) return;
    if (!socket?.connected) { alert('Connection lost. Please refresh.'); return; }
    setSending(true);
    try {
      let fileURL='', fileType='', fileName='';
      if (attachFile) {
        const fd = new FormData();
        fd.append('file', attachFile);
        const { data } = await chatAPI.uploadFile(fd);
        fileURL  = data.fileURL;
        fileType = data.fileType;
        fileName = data.fileName;
        removeAttachment();
      }
      const text = newMsg.trim();
      setNewMsg('');
      socket.emit('send_message', { conversationID: activeConv._id, text, fileURL, fileType, fileName });
    } catch(e) {
      alert('Failed to send: ' + (e.response?.data?.message || e.message));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [newMsg, attachFile, activeConv, sending, socket]);

  // Edit message via socket
  const handleEdit = useCallback((msgId, text) => {
    socket?.emit('edit_message', { messageID: msgId, text });
  }, [socket]);

  // Delete message via socket
  const handleDelete = useCallback((msgId) => {
    if (!window.confirm('Delete this message?')) return;
    socket?.emit('delete_message', { messageID: msgId });
  }, [socket]);

  const jumpToConv = (convId) => {
    const conv = convs.find(c => c._id===convId);
    if (conv) setActiveConv(conv);
    setIncomingToast(null);
  };

  const getOther = conv => conv.participants?.find(p => p._id!==user._id) || conv.participants?.[0];

  /* ── Render messages with date separators ── */
  const renderMessages = () => {
    const items = [];
    let lastKey = null;
    messages.forEach((msg, i) => {
      const key = getDateKey(msg.createdAt);
      if (key !== lastKey) {
        lastKey = key;
        items.push(
          <div key={`sep-${i}`} className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-earth-200"/>
            <span className="text-[10px] font-body font-semibold text-earth-400 uppercase tracking-wider px-3 py-1 bg-earth-100 rounded-full">
              {formatSeparator(key)}
            </span>
            <div className="flex-1 h-px bg-earth-200"/>
          </div>
        );
      }
      const isMe = (msg.senderID?._id || msg.senderID) === user._id;
      items.push(
        <MessageBubble
          key={msg._id}
          msg={msg}
          isMe={isMe}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      );
    });
    return items;
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="section-title text-3xl flex items-center gap-2">
            <MdChat className="text-leaf-500" size={32}/> {t('chat')}
          </h1>
          <p className="section-sub flex items-center gap-2">
            {lang==='ne' ? 'किसान वा उपभोक्तासँग सिधा कुराकानी' : `Chat with ${user?.role==='Farmer'?'consumers':'farmers'}`}
            <span className={`flex items-center gap-1 text-xs ${socket?.connected?'text-leaf-600':'text-red-400'}`}>
              <MdFiberManualRecord size={10}/>
              {socket?.connected?'Connected':'Reconnecting…'}
            </span>
          </p>
        </div>
      </div>

      {/* Incoming toast */}
      {incomingToast && (
        <div className="mb-3 p-3 bg-leaf-600 text-white rounded-2xl shadow-payment animate-slide-up flex items-center gap-3 cursor-pointer"
          onClick={() => jumpToConv(incomingToast.convId)}>
          <MdNotificationsActive size={20} className="shrink-0 animate-pulse"/>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold font-body">{incomingToast.name} sent you a message</p>
            <p className="text-xs text-leaf-200 font-body truncate">{incomingToast.text}</p>
          </div>
          <button onClick={e=>{e.stopPropagation();setIncomingToast(null);}} className="shrink-0 text-leaf-200 hover:text-white">
            <MdClose size={16}/>
          </button>
        </div>
      )}

      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* Conversation list */}
        <div className={`${activeConv?'hidden lg:flex':'flex'} flex-col w-full lg:w-72 bg-white rounded-2xl border border-earth-100 shadow-card overflow-hidden shrink-0`}>
          <div className="px-4 py-3 border-b border-earth-100 flex items-center justify-between">
            <h2 className="font-display font-semibold text-earth-800 text-sm">{t('conversations')}</h2>
            {Object.values(unreadConvs).reduce((a,b)=>a+b,0)>0 && (
              <span className="badge bg-leaf-500 text-white text-xs">{Object.values(unreadConvs).reduce((a,b)=>a+b,0)} new</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex justify-center py-8"><div className="spinner"/></div>
            ) : convs.length===0 ? (
              <div className="text-center py-12 px-4">
                <MdChat size={40} className="mx-auto mb-3 text-earth-200"/>
                <p className="text-sm font-body text-earth-400">{t('noConversations')}</p>
                <p className="text-xs font-body text-earth-300 mt-1">
                  {user?.role==='Consumer' ? "Click 'Chat with Farmer' on any product" : 'Consumers will message you about your products'}
                </p>
              </div>
            ) : convs.map(conv => {
              const other   = getOther(conv);
              const isActive  = activeConv?._id===conv._id;
              const hasUnread = unreadConvs[conv._id]>0;
              return (
                <div key={conv._id}
                  onClick={() => { setActiveConv(conv); setUnreadConvs(prev=>{const n={...prev};delete n[conv._id];return n;}); }}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-earth-50 hover:bg-earth-50 transition-colors
                    ${isActive?'bg-leaf-50':hasUnread?'bg-blue-50':''}`}>
                  <Avatar user={other} size="sm"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm font-body font-semibold truncate ${isActive?'text-leaf-700':'text-earth-800'}`}>{other?.name}</span>
                      {hasUnread && (
                        <span className="w-5 h-5 bg-leaf-500 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                          {unreadConvs[conv._id]}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs rounded-full px-1.5 font-body ${other?.role==='Farmer'?'badge-green':'badge-blue'}`}>{other?.role}</span>
                    {conv.productID && (
                      <p className="text-xs text-earth-400 font-body truncate flex items-center gap-1 mt-0.5">
                        <GiWheat size={10}/>{conv.productID.cropName}
                      </p>
                    )}
                    {conv.lastMessage && (
                      <p className={`text-xs font-body truncate mt-0.5 ${hasUnread?'text-earth-700 font-medium':'text-earth-400'}`}>
                        {conv.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Message area */}
        {activeConv ? (
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-earth-100 shadow-card overflow-hidden">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-earth-100 bg-white shrink-0">
              <button onClick={() => setActiveConv(null)} className="lg:hidden p-1.5 rounded-lg hover:bg-earth-100 text-earth-600">
                <MdArrowBack size={20}/>
              </button>
              <Avatar user={getOther(activeConv)}/>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-earth-800 font-body text-sm">{getOther(activeConv)?.name}</p>
                <p className="text-xs text-earth-400 font-body">
                  {activeConv.productID ? `Re: ${activeConv.productID.cropName}` : 'General inquiry'}
                </p>
              </div>
              <p className="text-xs text-earth-400 font-body hidden sm:block">Hover a message to edit / delete</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-1 bg-earth-50/40">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><div className="spinner"/></div>
              ) : messages.length===0 ? (
                <div className="text-center py-12">
                  <MdChat size={36} className="mx-auto mb-2 text-earth-200"/>
                  <p className="text-sm font-body text-earth-400">Start the conversation!</p>
                </div>
              ) : renderMessages()}
              <div ref={bottomRef}/>
            </div>

            {/* File preview */}
            <FilePreview file={attachFile} previewUrl={previewUrl} onRemove={removeAttachment}/>

            {/* Input bar */}
            <div className="flex items-end gap-2 px-4 py-3 border-t border-earth-100 bg-white shrink-0">
              {/* Attach file button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv,.zip"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl text-earth-400 hover:text-leaf-600 hover:bg-leaf-50 transition-colors shrink-0"
                title="Attach file or image"
              >
                <MdAttachFile size={22}/>
              </button>
              <button
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept='image/*'; fileInputRef.current.click(); setTimeout(()=>{if(fileInputRef.current)fileInputRef.current.accept='image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv,.zip';},500); } }}
                className="p-2.5 rounded-xl text-earth-400 hover:text-leaf-600 hover:bg-leaf-50 transition-colors shrink-0"
                title="Send image"
              >
                <MdImage size={22}/>
              </button>

              <textarea
                ref={inputRef}
                className="input flex-1 text-sm resize-none min-h-[42px] max-h-[120px]"
                rows={1}
                placeholder={t('typeMessage')}
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }}
              />
              <button
                onClick={sendMessage}
                disabled={(!newMsg.trim()&&!attachFile)||sending||!socket?.connected}
                className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                {sending ? <span className="spinner" style={{width:18,height:18,borderWidth:2}}/> : <MdSend size={18}/>}
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 bg-white rounded-2xl border border-earth-100 shadow-card items-center justify-center">
            <div className="text-center">
              <MdChat size={56} className="mx-auto mb-4 text-earth-200"/>
              <h3 className="font-display font-semibold text-earth-700 text-xl mb-2">Select a conversation</h3>
              <p className="text-earth-400 font-body text-sm max-w-xs">Choose from the left, or start a chat from any product page.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
