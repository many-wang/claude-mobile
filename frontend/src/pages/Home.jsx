import { useState, useEffect, useRef } from 'react'
import { sendMessage, createConversation, getProjects } from '../api'

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const initConversation = async () => {
    if (isInitializing || conversationId) return
    setIsInitializing(true)

    try {
      // 获取默认项目
      const projectsRes = await getProjects()
      const defaultProject = projectsRes.data.projects.find(p => p.name === '未分类') || projectsRes.data.projects[0]

      // 创建对话
      const res = await createConversation({
        project_id: defaultProject?.id,
        title: `对话 ${new Date().toLocaleString('zh-CN')}`
      })
      setConversationId(res.data.conversation.id)
      return res.data.conversation.id
    } catch (error) {
      console.error('初始化对话失败:', error)
      const errorMsg = error.response?.data?.error || error.message || '未知错误'
      alert('初始化失败: ' + errorMsg + '\n请检查后端服务是否正常运行')
      return null
    } finally {
      setIsInitializing(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // 第一次发送时创建对话
    let currentConvId = conversationId
    if (!currentConvId) {
      currentConvId = await initConversation()
      if (!currentConvId) {
        setSending(false)
        setInput(userMessage)
        return
      }
    }

    // 立即显示用户消息
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await sendMessage(currentConvId, userMessage)
      // 替换临时消息并添加助手回复
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        res.data.userMessage,
        res.data.assistantMessage
      ])
    } catch (error) {
      console.error('发送消息失败:', error)
      alert('发送失败: ' + (error.response?.data?.error || error.message))
      // 移除临时消息
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
      setInput(userMessage)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* 头部 */}
      <div className="bg-white border-b px-4 py-3">
        <h1 className="text-lg font-semibold text-center">Claude 随身助手</h1>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 bg-gray-50">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">💬</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">开始对话</h2>
              <p className="text-gray-600">在下方输入框发送消息，开始与 Claude 聊天</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div
                    className={`text-xs mt-2 ${
                      msg.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
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
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入框 */}
      <div className="bg-white border-t px-4 py-4">
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
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows="3"
              disabled={sending || isInitializing}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || isInitializing}
              className="px-6 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {isInitializing ? '初始化...' : '发送'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
