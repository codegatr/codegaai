const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codega", {
  getStatus: () => ipcRenderer.invoke("app:status"),
  getModels: () => ipcRenderer.invoke("models:list"),
  moveModelStorage: () => ipcRenderer.invoke("model-storage:move"),
  sendMessage: (message, opts) => ipcRenderer.invoke("chat:send", message, opts),
  shareChat: (chat) => ipcRenderer.invoke("chat:share", chat),
  prepareModel: (modelId) => ipcRenderer.invoke("model:prepare", modelId),
  listModels: () => ipcRenderer.invoke("models:list"),
  deleteModel: (payload) => ipcRenderer.invoke("model:delete", payload),
  setupModel: (payload) => ipcRenderer.invoke("model:setup", payload),
  modelUpdatesStatus: () => ipcRenderer.invoke("model-updates:status"),
  checkModelUpdates: () => ipcRenderer.invoke("model-updates:check"),
  applyModelUpdate: (name) => ipcRenderer.invoke("model-updates:apply", name),
  getMetrics: () => ipcRenderer.invoke("metrics:get"),
  getStats: () => ipcRenderer.invoke("stats:get"),
  getLogs: () => ipcRenderer.invoke("logs:get"),
  automationsStatus: () => ipcRenderer.invoke("automations:status"),
  agentWatchStatus: () => ipcRenderer.invoke("agent-watch:status"),
  runAgentWatch: () => ipcRenderer.invoke("agent-watch:scan"),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  securityStatus: () => ipcRenderer.invoke("security:status"),
  routerInfo: () => ipcRenderer.invoke("router:info"),
  routerTest: (payload) => ipcRenderer.invoke("router:test", payload),
  clearLogs: () => ipcRenderer.invoke("logs:clear"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  sendNotification: (opts) => ipcRenderer.invoke("notifications:send", opts),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  listMemory: () => ipcRenderer.invoke("memory:list"),
  clearMemory: () => ipcRenderer.invoke("memory:clear"),
  testGithub: () => ipcRenderer.invoke("github:test"),
  syncKnowledgeUp: () => ipcRenderer.invoke("knowledge:syncUp"),
  syncKnowledgeDown: () => ipcRenderer.invoke("knowledge:syncDown"),
  installOllama: () => ipcRenderer.invoke("ollama:install"),
  ragIngest: (payload) => ipcRenderer.invoke("rag:ingest", payload),
  ragStats: () => ipcRenderer.invoke("rag:stats"),
  ragList: () => ipcRenderer.invoke("rag:list"),
  ragDelete: (payload) => ipcRenderer.invoke("rag:delete", payload),
  ragSearch: (payload) => ipcRenderer.invoke("rag:search", payload),
  ragClear: () => ipcRenderer.invoke("rag:clear"),
  runMaintenance: () => ipcRenderer.invoke("maintenance:run"),
  maintenanceStatus: () => ipcRenderer.invoke("maintenance:status"),
  proposeImprovement: (payload) => ipcRenderer.invoke("improve:propose", payload),
  runAutonomousDevelopment: (payload) => ipcRenderer.invoke("development:run", payload),
  autonomousDevelopmentStatus: () => ipcRenderer.invoke("development:status"),
  improveDrafts: () => ipcRenderer.invoke("improve:drafts"),
  clearImproveDrafts: () => ipcRenderer.invoke("improve:clearDrafts"),
  recordFeedback: (payload) => ipcRenderer.invoke("feedback:record", payload),
  feedbackStats: () => ipcRenderer.invoke("feedback:stats"),
  analyzeSystem: () => ipcRenderer.invoke("system:analyze"),
  cookbookScan: () => ipcRenderer.invoke("cookbook:scan"),
  testProvider: (payload) => ipcRenderer.invoke("provider:test", payload),
  runCode: (payload) => ipcRenderer.invoke("code:run", payload),
  devPrompt: (payload) => ipcRenderer.invoke("dev:prompt", payload),
  abortChat: () => ipcRenderer.invoke("chat:abort"),
  mcpListTools: (payload) => ipcRenderer.invoke("mcp:listTools", payload),
  mcpCallTool: (payload) => ipcRenderer.invoke("mcp:callTool", payload),
  mcpRefreshTools: () => ipcRenderer.invoke("mcp:refreshTools"),
  mcpHealth: () => ipcRenderer.invoke("mcp:health"),
  addTrustedWorkspace: () => ipcRenderer.invoke("workspace:addTrusted"),
  removeTrustedWorkspace: (folder) => ipcRenderer.invoke("workspace:removeTrusted", folder),
  learnNow: (payload) => ipcRenderer.invoke("learning:now", payload),
  learningList: () => ipcRenderer.invoke("learning:list"),
  clearLearning: () => ipcRenderer.invoke("learning:clear"),
  onChatStream: (cb) => {
    const handler = (_e, token) => cb(token);
    ipcRenderer.on("chat:stream", handler);
    return () => ipcRenderer.removeListener("chat:stream", handler);
  },
  onChatStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("chat:status", handler);
    return () => ipcRenderer.removeListener("chat:status", handler);
  },
  onModelStatus: (callback) => {
    ipcRenderer.on("model:status", (_event, payload) => callback(payload));
  },
  onModelUpdateStatus: (callback) => {
    ipcRenderer.on("model-updates:status", (_event, payload) => callback(payload));
  },
  onModelStorageStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("model-storage:status", handler);
    return () => ipcRenderer.removeListener("model-storage:status", handler);
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on("updates:status", (_event, payload) => callback(payload));
  },

  // ZIP Engine API
  zip: {
    list:    (zipPath)                    => ipcRenderer.invoke("zip:list",    zipPath),
    analyze: (zipPath)                    => ipcRenderer.invoke("zip:analyze", zipPath),
    read:    (zipPath, entry)             => ipcRenderer.invoke("zip:read",    zipPath, entry),
    extract: (zipPath, destDir)           => ipcRenderer.invoke("zip:extract", zipPath, destDir),
    patch:   (zipPath, destZip, patches)  => ipcRenderer.invoke("zip:patch",   zipPath, destZip, patches),
    create:  (sourceDir, destZip)         => ipcRenderer.invoke("zip:create",  sourceDir, destZip),
  },

  // Git Agent API
  git: {
    findRoot:       (dir)              => ipcRenderer.invoke("git:find-root",       dir),
    status:         (repo)             => ipcRenderer.invoke("git:status",           repo),
    diff:           (repo, staged)     => ipcRenderer.invoke("git:diff",             repo, staged),
    log:            (repo, opts)       => ipcRenderer.invoke("git:log",              repo, opts),
    branches:       (repo)             => ipcRenderer.invoke("git:branches",         repo),
    tags:           (repo)             => ipcRenderer.invoke("git:tags",             repo),
    suggestCommit:  (repo)             => ipcRenderer.invoke("git:suggest-commit",   repo),
    suggestBranch:  (desc, type)       => ipcRenderer.invoke("git:suggest-branch",   desc, type),
    releaseNotes:   (repo, from, ver)  => ipcRenderer.invoke("git:release-notes",    repo, from, ver),
    changelog:      (repo, max)        => ipcRenderer.invoke("git:changelog",        repo, max),
    explainConflict:(block)            => ipcRenderer.invoke("git:explain-conflict", block),
  },

  // Project Memory API
  projectMemory: {
    list:        ()                       => ipcRenderer.invoke("project-memory:list"),
    create:      (name, opts)             => ipcRenderer.invoke("project-memory:create",      name, opts),
    get:         (id)                     => ipcRenderer.invoke("project-memory:get",          id),
    updateMeta:  (id, patch)              => ipcRenderer.invoke("project-memory:update-meta",  id, patch),
    delete:      (id)                     => ipcRenderer.invoke("project-memory:delete",       id),
    append:      (id, category, entry)    => ipcRenderer.invoke("project-memory:append",       id, category, entry),
    removeEntry: (id, category, index)    => ipcRenderer.invoke("project-memory:remove-entry", id, category, index),
    replaceCat:  (id, category, entries)  => ipcRenderer.invoke("project-memory:replace-cat",  id, category, entries),
    search:      (id, query)              => ipcRenderer.invoke("project-memory:search",        id, query),
    searchAll:   (query)                  => ipcRenderer.invoke("project-memory:search-all",   query),
    detect:      (hints)                  => ipcRenderer.invoke("project-memory:detect",        hints),
    context:     (id, max)                => ipcRenderer.invoke("project-memory:context",       id, max),
    categories:  ()                       => ipcRenderer.invoke("project-memory:categories"),
  },

  // Builder Engine API
  builder: {
    stacks:  ()       => ipcRenderer.invoke("builder:stacks"),
    build:   (spec)   => ipcRenderer.invoke("builder:build",   spec),
    preview: (spec)   => ipcRenderer.invoke("builder:preview", spec),
  },
  // Plugin System API
  plugins: {
    list:           ()          => ipcRenderer.invoke("plugin:list"),
    info:           (id)        => ipcRenderer.invoke("plugin:info",           id),
    enable:         (id)        => ipcRenderer.invoke("plugin:enable",         id),
    disable:        (id)        => ipcRenderer.invoke("plugin:disable",        id),
    installZip:     (zipPath)   => ipcRenderer.invoke("plugin:install-zip",    zipPath),
    uninstall:      (id)        => ipcRenderer.invoke("plugin:uninstall",      id),
    reload:         (id)        => ipcRenderer.invoke("plugin:reload",         id),
    intentHandlers: ()          => ipcRenderer.invoke("plugin:intent-handlers"),
  },

  // MissionOS API — Sprint 10
  mission: {
    create:       (intent, ctx)              => ipcRenderer.invoke("mission:create",        intent, ctx),
    createManual: (opts)                     => ipcRenderer.invoke("mission:create-manual",  opts),
    list:         (stateFilter)              => ipcRenderer.invoke("mission:list",           stateFilter),
    get:          (id)                       => ipcRenderer.invoke("mission:get",            id),
    execute:      (id)                       => ipcRenderer.invoke("mission:execute",        id),
    approve:      (id, note)                 => ipcRenderer.invoke("mission:approve",        id, note),
    release:      (id, version)              => ipcRenderer.invoke("mission:release",        id, version),
    cancel:       (id)                       => ipcRenderer.invoke("mission:cancel",         id),
    completeTask: (missionId, taskId, res)   => ipcRenderer.invoke("mission:complete-task",  missionId, taskId, res),
    summary:      ()                         => ipcRenderer.invoke("mission:summary"),
    events:       (n)                        => ipcRenderer.invoke("mission:events",         n),
    queue:        (id)                       => ipcRenderer.invoke("mission:queue",          id),
    on:  (channel, fn) => {
      const allowed = [
        "mission:created", "mission:started", "mission:review", "mission:failed",
        "mission:cancelled", "mission:progress",
        "mission:task:started", "mission:task:completed", "mission:task:failed",
      ];
      if (!allowed.includes(channel)) return;
      ipcRenderer.on(channel, (_e, data) => fn(data));
    },
    off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
  },

  // Evolution Engine API — Sprint 11
  evolution: {
    analyze:    ()         => ipcRenderer.invoke("evolution:analyze"),
    report:     (n)        => ipcRenderer.invoke("evolution:reports",       n),
    dna: {
      evaluate:  (opts)    => ipcRenderer.invoke("evolution:dna:evaluate",   opts),
      list:      ()        => ipcRenderer.invoke("evolution:dna:list"),
      trend:     (n)       => ipcRenderer.invoke("evolution:dna:trend",      n),
      byVersion: (version) => ipcRenderer.invoke("evolution:dna:by-version", version),
    },
  },

  // Autonomous Evolution Platform (AEP) API — Sprint XX
  aep: {
    dashboard:        ()                    => ipcRenderer.invoke("aep:dashboard"),
    backlog: {
      list:           (opts)                => ipcRenderer.invoke("aep:backlog:list",    opts),
      add:            (opts)                => ipcRenderer.invoke("aep:backlog:add",     opts),
      update:         (id, patch)           => ipcRenderer.invoke("aep:backlog:update",  id, patch),
      summary:        ()                    => ipcRenderer.invoke("aep:backlog:summary"),
    },
    proposals: {
      list:           (opts)                => ipcRenderer.invoke("aep:proposals:list",    opts),
      approve:        (id)                  => ipcRenderer.invoke("aep:proposals:approve", id),
      reject:         (id, reason)          => ipcRenderer.invoke("aep:proposals:reject",  id, reason),
      summary:        ()                    => ipcRenderer.invoke("aep:proposals:summary"),
    },
    patch:            (proposalId)          => ipcRenderer.invoke("aep:patch:run",         proposalId),
    score: {
      latest:         ()                    => ipcRenderer.invoke("aep:score:latest"),
      history:        (n)                   => ipcRenderer.invoke("aep:score:history",     n),
      record:         (opts)                => ipcRenderer.invoke("aep:score:record",      opts),
    },
    learning: {
      summary:        ()                    => ipcRenderer.invoke("aep:learning:summary"),
      query:          (opts)                => ipcRenderer.invoke("aep:learning:query",    opts),
    },
    intel: {
      analyze:        ()                    => ipcRenderer.invoke("aep:intel:analyze"),
      summary:        ()                    => ipcRenderer.invoke("aep:intel:summary"),
    },
    genome: {
      latest:         ()                    => ipcRenderer.invoke("aep:genome:latest"),
      report:         ()                    => ipcRenderer.invoke("aep:genome:report"),
    },
    cycle:            (report, version)     => ipcRenderer.invoke("aep:cycle:run",         report, version),
    closeTask:        (taskId)              => ipcRenderer.invoke("aep:close-task",         taskId),
    on: (channel, fn) => {
      const allowed = [
        "aep:cycle:start", "aep:cycle:complete", "aep:cycle:error",
        "aep:patch:start", "aep:patch:pr_open",  "aep:patch:failed",
        "aep:genome:update",
      ];
      if (!allowed.includes(channel)) return;
      ipcRenderer.on(channel, (_e, data) => fn(data));
    },
    off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
  },
  ace: {
    dashboard:        ()             => ipcRenderer.invoke("ace:dashboard"),
    context:          (opts)         => ipcRenderer.invoke("ace:context",          opts),
    processMessage:   (msg, userId)  => ipcRenderer.invoke("ace:process-message",  { message: msg, userId }),

    project: {
      activate:       (label, userId)  => ipcRenderer.invoke("ace:project:activate",   { label, userId }),
      context:        (label)          => ipcRenderer.invoke("ace:project:context",     { label }),
      addArch:        (label, text)    => ipcRenderer.invoke("ace:project:add-arch",    { label, text }),
      addTodo:        (label, text)    => ipcRenderer.invoke("ace:project:add-todo",    { label, text }),
      resolveTodo:    (label, id)      => ipcRenderer.invoke("ace:project:resolve-todo",{ label, id }),
    },

    working: {
      setProject:     (label)          => ipcRenderer.invoke("ace:working:set-project",  { label }),
      setMission:     (label)          => ipcRenderer.invoke("ace:working:set-mission",  { label }),
      setTask:        (task)           => ipcRenderer.invoke("ace:working:set-task",      { task }),
      addDecision:    (decision, r)    => ipcRenderer.invoke("ace:working:add-decision", { decision, rationale: r }),
      snapshot:       ()               => ipcRenderer.invoke("ace:working:snapshot"),
    },

    goal: {
      add:            (opts)           => ipcRenderer.invoke("ace:goal:add",     opts),
      list:           (userId)         => ipcRenderer.invoke("ace:goal:list",    { userId }),
      achieve:        (id)             => ipcRenderer.invoke("ace:goal:achieve", { id }),
      summary:        (userId)         => ipcRenderer.invoke("ace:goal:summary", { userId }),
    },

    user: {
      observe:        (userId, data)   => ipcRenderer.invoke("ace:user:observe",  { userId, ...data }),
      context:        (userId)         => ipcRenderer.invoke("ace:user:context",  { userId }),
      summary:        ()               => ipcRenderer.invoke("ace:user:summary"),
    },

    engineering: {
      learn:          (opts)           => ipcRenderer.invoke("ace:engineering:learn",   opts),
      query:          (opts)           => ipcRenderer.invoke("ace:engineering:query",   opts),
      summary:        ()               => ipcRenderer.invoke("ace:engineering:summary"),
    },

    reflect:          (userId)         => ipcRenderer.invoke("ace:reflect",            { userId }),

    lifeGraph: {
      summary:        ()               => ipcRenderer.invoke("ace:life-graph:summary"),
      upsertNode:     (nodeData)       => ipcRenderer.invoke("ace:life-graph:upsert-node", nodeData),
    },
  },
});
