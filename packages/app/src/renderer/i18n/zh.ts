const zh = {
  // App name
  'app.name': '半卷闲书',
  'app.slogan': '腹有诗书气自华',

  // Welcome
  'welcome.selectDir': '选择目录',
  'welcome.opening': '正在打开...',
  'welcome.createLibrary': '创建新书房',
  'welcome.createLibraryDesc': '该目录尚未初始化为书房，请为它取一个名字',
  'welcome.libraryName': '书房名称',
  'welcome.cancel': '取消',
  'welcome.creating': '创建中...',
  'welcome.create': '创建',

  // Common
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.back': '← 返回',
  'common.loading': '加载中...',
  'common.search': '搜索...',
  'common.import': '导入',
  'common.unload': '卸载',
  'common.new': '+ 新建',

  // Library sidebar
  'library.documents': '文档库',
  'library.notes': '笔记',
  'library.mindmaps': '脑图',
  'library.graph': '知识图谱',
  'library.sync': '同步',
  'library.plugins': '插件',
  'library.tags': '标签',
  'library.noTags': '无标签',
  'library.noPlugins': '无已加载插件',
  'library.tab': '书库',

  // Library content
  'library.newNote': '新建笔记',
  'library.newFolder': '新建文件夹',
  'library.rename': '重命名',
  'library.newMindmap': '新建脑图',
  'library.colTitle': '标题',
  'library.colType': '类型',
  'library.colCreatedAt': '创建时间',
  'library.emptyDir': '该目录下没有文件',
  'library.emptyDocuments': '文档库为空',
  'library.allNotes': '全部',
  'library.recentNotes': '最近',
  'library.emptyNotes': '还没有笔记',
  'library.emptyMindmaps': '还没有脑图',

  // Library detail
  'detail.title': '详情',
  'detail.docTitle': '标题',
  'detail.type': '类型',
  'detail.path': '路径',
  'detail.hash': 'Hash',
  'detail.authors': '作者',
  'detail.createdAt': '创建时间',
  'detail.updatedAt': '更新时间',
  'detail.syncStatus': '同步状态',
  'detail.synced': '已同步',
  'detail.cloud': '云端',
  'detail.local': '本地',
  'detail.download': '下载到本地',
  'detail.upload': '上传到云端',
  'detail.downloadFailed': '下载失败',
  'detail.uploadFailed': '上传失败',

  // Prompts
  'prompt.noteTitle': '笔记标题:',
  'prompt.folderName': '文件夹名称:',
  'prompt.mindmapTitle': '脑图标题:',
  'prompt.nodeTitle': '节点标题：',
  'prompt.childNodeTitle': '子节点标题：',

  // PDF viewer
  'pdf.thumbnails': '缩略图',
  'pdf.outline': '目录',
  'pdf.annotations': '标注',
  'pdf.notes': '笔记',
  'pdf.noAnnotations': '暂无标注',
  'pdf.noNotes': '暂无笔记',
  'pdf.noOutline': '此文档无目录',
  'pdf.newNote': '+ 新建笔记',
  'pdf.loadingPdf': 'Loading PDF...',
  'pdf.areaScreenshot': '区域截图',
  'pdf.areaSelect': '区域选取',
  'pdf.page': '第 {0} 页',

  // PDF tools
  'tool.highlight': '高亮',
  'tool.text': '文本',
  'tool.area': '区域',
  'tool.ink': '画笔',
  'tool.eraser': '擦除',
  'tool.noteInput': '输入笔记...',

  // Note view
  'note.saving': '保存中...',
  'note.saved': '已保存',

  // Mindmap
  'mindmap.label': '脑图',
  'mindmap.addRoot': '+ 根节点',
  'mindmap.addChild': '+ 子节点',
  'mindmap.delete': '删除',
  'mindmap.undo': '撤销',
  'mindmap.redo': '重做',
  'mindmap.export': '导出',
  'mindmap.search': '搜索节点...',
  'mindmap.properties': '属性',
  'mindmap.themes': '主题',

  // Sync
  'sync.title': 'WebDAV 同步配置',
  'sync.url': 'WebDAV 地址',
  'sync.username': '用户名',
  'sync.password': '密码',
  'sync.remotePath': '远端路径',
  'sync.saveConfig': '保存配置',
  'sync.saving': '保存中…',
  'sync.syncNow': '立即同步',
  'sync.syncing': '同步中…',
  'sync.configSaved': '配置已保存',
  'sync.saveFailed': '保存失败：{0}',
  'sync.syncSuccess': '同步成功 — 上传 {0}，下载 {1}，本地删除 {2}，远端删除 {3}',
  'sync.syncWithErrors': '同步完成（有错误）：{0}',
  'sync.syncFailed': '同步失败：{0}',

  // Annotation sidebar
  'annotation.title': '标注',
  'annotation.highlight': '高亮',
  'annotation.note': '批注',
  'annotation.empty': '选中文本后即可创建标注',

  // Settings
  'settings.title': '设置',
  'settings.language': '语言 / Language',

  // Selection toolbar
  'selection.annotate': '批注',

  // Search
  'search.placeholder': '搜索...',
  'search.caseSensitive': '大小写',
  'search.wholeWord': '全词',

  // Graph
  'graph.title': '知识图谱',
  'graph.stats': '{0} 节点 · {1} 连接',
  'graph.empty': '添加文档和笔记后，知识图谱将自动生成',

  // PDF info sidebar
  'info.addField': '+ 添加字段',

  // EPUB viewer
  'epub.outline': '目录',
  'epub.annotations': '标注',
  'epub.notes': '笔记',
  'epub.noAnnotations': '暂无标注',
  'epub.noNotes': '暂无笔记',
  'epub.noOutline': '此文档无目录',
  'epub.newNote': '+ 新建笔记',
  'epub.chapter': '章节',

  // Note creation from PDF
  'note.defaultTitle': '{0} — 笔记',

  // Multi-window
  'library.openAnother': '打开其他书房',
} as const

export default zh
