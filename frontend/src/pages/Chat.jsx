import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getConversation, sendMessage, exportConversation, searchMessages } from '../api'

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const messageRefs = useRef({})
  const messagesEndRef = useRef(null)

  const getFriendlyErrorMessage = (error) => {
    const message = error.response?.data?.error || error.message || '发送失败，请重试'

    if (message.includes('通道繁忙') || message.includes('候选模型均不可用')) {
      return '当前代理通道繁忙，请稍后重试。'
    }

    if (message.includes('对话过长') || message.includes('上下文过长') || message.includes('compact') || message.includes('clear')) {
      return '当前对话上下文过长，建议新开一个对话。'
    }

    return message
  }

  useEffect(() => {
    loadConversation()
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!highlightedMessageId) return

    const timer = window.setTimeout(() => {
      setHighlightedMessageId(null)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [highlightedMessageId])

  const summaryText = useMemo(() => summary?.summary || conversation?.last_summary || '', [summary, conversation])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadConversation = async () => {
    try {
      const data = await getConversation(id)
      setConversation(data.conversation)
      setMessages(data.messages)
      setSummary(data.summary)
    } catch (error) {
      console.error('加载对话失败:', error)
      alert('对话不存在')
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const data = await sendMessage(id, userMessage)
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage
      ])
      if (data.summary) {
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('发送消息失败:', error)
      alert(getFriendlyErrorMessage(error))
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
      setInput(userMessage)
    } finally {
      setSending(false)
    }
  }

  const handleExport = async () => {
    try {
      const res = await exportConversation(id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${conversation.title}.md`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    try {
      const data = await searchMessages(searchQuery, { conversation_id: id, limit: 20 })
      setSearchResults(data.results)
    } catch (error) {
      console.error('搜索失败:', error)
      alert(error.response?.data?.error || '搜索失败，请重试')
    } finally {
      setSearchLoading(false)
    }
  }

  const jumpToMessage = (messageId) => {
    setHighlightedMessageId(messageId)
    messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#1a1a1a] text-[#e5e5e5]">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="bg-[#2d2d2d] border-b border-[#3d3d3d] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/')}
              className="text-[#999] hover:text-white shrink-0"
            >
              ← 返回
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate text-[#ff6b35]">{conversation?.title}</h1>
              {summaryText && (
                <p className="text-xs text-[#999] truncate mt-1">{summaryText}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleExport}
            className="text-sm text-[#ff6b35] hover:text-[#ff8555] shrink-0"
          >
            导出 Markdown
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="text-center text-[#999] py-12">
                开始对话吧！
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  ref={(node) => {
                    if (node) {
                      messageRefs.current[msg.id] = node
                    }
                  }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 border transition-all ${
                      msg.role === 'user'
                        ? 'bg-[#ff6b35] text-white border-[#ff6b35]'
                        : 'bg-[#2d2d2d] border-[#3d3d3d] text-[#e5e5e5]'
                    } ${highlightedMessageId === msg.id ? 'ring-2 ring-[#ff6b35]' : ''}`}
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    <div
                      className={`text-xs mt-2 ${
                        msg.role === 'user' ? 'text-orange-200' : 'text-[#999]'
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString('zh-CN')}
                    </div>
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#ff6b35] rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-[#ff6b35] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-[#ff6b35] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="bg-[#2d2d2d] border-t border-[#3d3d3d] px-4 py-4">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e)
                  }
                }}
                placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] text-[#e5e5e5] placeholder-[#666] rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-transparent resize-none"
                rows="3"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="px-6 bg-[#ff6b35] text-white rounded-lg hover:bg-[#ff8555] disabled:bg-[#3d3d3d] disabled:text-[#666] disabled:cursor-not-allowed transition"
              >
                发送
              </button>
            </div>
          </form>
        </div>
      </div>

      <aside className="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-l border-[#3d3d3d] bg-[#202020] flex flex-col">
        <div className="px-4 py-4 border-b border-[#3d3d3d]">
          <h2 className="text-sm font-semibold text-[#ff6b35] mb-3">历史检索</h2>
          <form onSubmit={handleSearch} className="space-y-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索当前对话内容"
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3d3d3d] text-[#e5e5e5] placeholder-[#666] rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-transparent"
            />
            <button
              type="submit"
              disabled={searchLoading}
              className="w-full bg-[#ff6b35] text-white py-2 rounded-lg hover:bg-[#ff8555] disabled:bg-[#3d3d3d] disabled:text-[#666]"
            >
              {searchLoading ? '搜索中...' : '搜索'}
            </button>
          </form>
        </div>

        <div className="px-4 py-4 border-b border-[#3d3d3d]">
          <h3 className="text-sm font-semibold text-[#ff6b35] mb-2">对话摘要</h3>
          <p className="text-sm text-[#b5b5b5] whitespace-pre-wrap break-words min-h-[60px]">
            {summaryText || '消息较少时不会生成摘要。'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {searchResults.length === 0 ? (
            <div className="text-sm text-[#777]">输入关键词后可检索当前对话历史。</div>
          ) : (
            searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => jumpToMessage(result.id)}
                className="w-full text-left p-3 rounded-lg border border-[#3d3d3d] bg-[#1a1a1a] hover:border-[#ff6b35] transition"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-[#999] mb-2">
                  <span>{result.role === 'user' ? '用户' : 'Claude'}</span>
                  <span>{new Date(result.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div className="text-sm text-[#e5e5e5] whitespace-pre-wrap break-words">
                  {result.snippet || result.content}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  )
}
