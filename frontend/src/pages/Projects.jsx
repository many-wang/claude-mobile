import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, createProject, deleteProject, getProjectConversations } from '../api'

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [conversations, setConversations] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const res = await getProjects()
      setProjects(res.data.projects)
    } catch (error) {
      console.error('加载项目失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    try {
      await createProject({
        name: newProjectName,
        description: newProjectDesc
      })
      setNewProjectName('')
      setNewProjectDesc('')
      setShowNewProject(false)
      loadProjects()
    } catch (error) {
      console.error('创建项目失败:', error)
      alert('创建项目失败，请重试')
    }
  }

  const handleDeleteProject = async (id) => {
    if (!confirm('确定要删除这个项目吗？项目下的所有对话也会被删除。')) return

    try {
      await deleteProject(id)
      loadProjects()
      if (selectedProject === id) {
        setSelectedProject(null)
        setConversations([])
      }
    } catch (error) {
      console.error('删除项目失败:', error)
      alert('删除项目失败，请重试')
    }
  }

  const handleSelectProject = async (projectId) => {
    setSelectedProject(projectId)
    try {
      const res = await getProjectConversations(projectId)
      setConversations(res.data.conversations)
    } catch (error) {
      console.error('加载对话失败:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">项目管理</h1>
        <p className="text-gray-600">管理你的项目和对话分类</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
            <button
              onClick={() => setShowNewProject(!showNewProject)}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700"
            >
              + 新建项目
            </button>

            {showNewProject && (
              <form onSubmit={handleCreateProject} className="mt-4 space-y-3">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="项目名称"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="项目描述（可选）"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows="2"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700"
                  >
                    创建
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewProject(false)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">所有项目</h2>
            <div className="space-y-2">
              {projects.map(project => (
                <div
                  key={project.id}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    selectedProject === project.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                  onClick={() => handleSelectProject(project.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{project.name}</div>
                      {project.description && (
                        <div className="text-sm text-gray-600 mt-1">{project.description}</div>
                      )}
                    </div>
                    {project.name !== '未分类' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProject(project.id)
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">
            {selectedProject ? '项目对话' : '选择一个项目查看对话'}
          </h2>
          {selectedProject ? (
            <div className="space-y-2">
              {conversations.length > 0 ? (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => navigate(`/chat/${conv.id}`)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition"
                  >
                    <div className="font-medium text-gray-900">{conv.title}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(conv.updated_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-8">
                  该项目下还没有对话
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              点击左侧项目查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
