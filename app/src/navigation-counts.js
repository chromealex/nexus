const visible = chat => !chat.archived && !chat.deletedAt;
export function projectChatCount(chats, projectId) {
  return chats.filter(c => c.projectId === projectId && visible(c)).length;
}
export function folderChatCount(chats, folders, projectId, folderId) {
  const ids = new Set([folderId]);
  for (let i = 0; i < 17; i++) {
    const before = ids.size;
    for (const folder of folders)
      if (folder.projectId === projectId && ids.has(folder.parentId)) ids.add(folder.id);
    if (ids.size === before) break;
  }
  return chats.filter(c => c.projectId === projectId && visible(c) && ids.has(c.folderId)).length;
}
