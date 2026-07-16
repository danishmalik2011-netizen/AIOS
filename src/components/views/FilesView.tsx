import { useCallback, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Editor from '@monaco-editor/react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Save,
  Search,
  X,
  Sidebar,
} from 'lucide-react';
import type { ProjectFile } from '@/core/types';
import { useProjectStore } from '@/store/useProjectStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { IconButton } from '@/components/shared/IconButton';
import { Input } from '@/components/shared/Input';
import { Spinner } from '@/components/shared/Spinner';
import './FilesView.css';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map a ProjectFile.language onto a Monaco language id. */
function toMonacoLanguage(language: string | undefined): string {
  switch (language) {
    case 'typescript':
      return 'typescript';
    case 'javascript':
      return 'javascript';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'markdown':
      return 'markdown';
    case 'html':
      return 'html';
    default:
      return 'plaintext';
  }
}

/** Pick a language-appropriate icon for a file leaf. */
function fileIconFor(file: ProjectFile) {
  switch (file.language) {
    case 'typescript':
    case 'javascript':
    case 'html':
      return FileCode;
    case 'json':
      return FileJson;
    case 'markdown':
      return FileText;
    case 'css':
      return Hash;
    default:
      return FileIcon;
  }
}

/**
 * Build a friendly placeholder for files that have no seeded content,
 * using a comment style appropriate to the language.
 */
function generatePlaceholder(file: ProjectFile): string {
  const { path, language } = file;
  switch (language) {
    case 'css':
      return `/* ${path} */\n\n/* No preview content available for this file yet. */\n`;
    case 'markdown':
      return `# ${file.name}\n\n> \`${path}\`\n\nNo preview content available for this file yet.\n`;
    case 'json':
      return `{\n  "_file": "${path}",\n  "_note": "No preview content available for this file yet."\n}\n`;
    default:
      return `// ${path}\n//\n// No preview content available for this file yet.\n`;
  }
}

/**
 * Filter a file tree by name against a query. Directories are kept when
 * they (or any descendant) match; matched subtrees are returned intact.
 * Returns null for a subtree that has no matches.
 */
export function filterTree(files: ProjectFile[], query: string): ProjectFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;

  const walk = (nodes: ProjectFile[]): ProjectFile[] => {
    const out: ProjectFile[] = [];
    for (const node of nodes) {
      const selfMatch = node.name.toLowerCase().includes(q);
      if (node.type === 'directory') {
        const children = node.children ? walk(node.children) : [];
        if (selfMatch || children.length > 0) {
          out.push({ ...node, children, isExpanded: true });
        }
      } else if (selfMatch) {
        out.push(node);
      }
    }
    return out;
  };

  return walk(files);
}

/** Flatten a tree into a lookup of id → ProjectFile (files only). */
function indexFiles(files: ProjectFile[], acc: Record<string, ProjectFile> = {}) {
  for (const node of files) {
    if (node.type === 'file') acc[node.id] = node;
    if (node.children) indexFiles(node.children, acc);
  }
  return acc;
}

/* ------------------------------------------------------------------ */
/*  Tree row                                                          */
/* ------------------------------------------------------------------ */

interface TreeNodeProps {
  node: ProjectFile;
  depth: number;
  activeFileId: string | null;
  onToggle: (id: string) => void;
  onOpen: (file: ProjectFile) => void;
}

export function TreeNode({ node, depth, activeFileId, onToggle, onOpen }: TreeNodeProps) {
  const isDir = node.type === 'directory';
  const isActive = !isDir && node.id === activeFileId;
  const indent = { paddingLeft: `calc(${depth} * var(--space-4) + var(--space-2))` };

  const handleActivate = useCallback(() => {
    if (isDir) {
      onToggle(node.id);
    } else {
      onOpen(node);
      useSettingsStore.getState().setActiveView('files');
    }
  }, [isDir, node, onToggle, onOpen]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate]
  );

  const Leaf = fileIconFor(node);

  return (
    <div className="filesview__tree-branch">
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={isDir ? Boolean(node.isExpanded) : undefined}
        aria-selected={isActive}
        data-file-id={node.id}
        data-file-type={node.type}
        className={[
          'filesview__row',
          isDir ? 'filesview__row--dir' : 'filesview__row--file',
          isActive ? 'filesview__row--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={indent}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
      >
        {isDir ? (
          <>
            <span className="filesview__row-chevron">
              {node.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="filesview__row-icon filesview__row-icon--folder">
              {node.isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
            </span>
          </>
        ) : (
          <>
            <span className="filesview__row-chevron filesview__row-chevron--empty" />
            <span className="filesview__row-icon">
              <Leaf size={15} />
            </span>
          </>
        )}
        <span className="filesview__row-name">{node.name}</span>
        {!isDir && node.isModified && (
          <span className="filesview__row-dot" title="Unsaved changes" aria-label="Modified" />
        )}
      </div>

      {isDir && node.isExpanded && node.children && node.children.length > 0 && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilesView                                                         */
/* ------------------------------------------------------------------ */

export function FilesView() {
  const fileTree = useProjectStore((s) => s.fileTree);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const isLoadingTree = useProjectStore((s) => s.isLoadingTree);
  const activeFileId = useProjectStore((s) => s.activeFileId);
  const openFiles = useProjectStore((s) => s.openFiles);
  const fileContents = useProjectStore((s) => s.fileContents);
  const loadingFileIds = useProjectStore((s) => s.loadingFileIds);
  const dirtyFileIds = useProjectStore((s) => s.dirtyFileIds);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const openFile = useProjectStore((s) => s.openFile);
  const closeFile = useProjectStore((s) => s.closeFile);
  const toggleFolder = useProjectStore((s) => s.toggleFolder);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const setDraftContent = useProjectStore((s) => s.setDraftContent);
  const saveActiveFile = useProjectStore((s) => s.saveActiveFile);
  const openFolder = useProjectStore((s) => s.openFolder);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);

  const isElectron = typeof window !== 'undefined' && Boolean(window.aios);

  const filteredTree = useMemo(
    () => filterTree(fileTree, searchQuery),
    [fileTree, searchQuery]
  );

  const fileIndex = useMemo(() => indexFiles(fileTree), [fileTree]);

  const activeFile = useMemo(
    () => (activeFileId ? fileIndex[activeFileId] ?? null : null),
    [activeFileId, fileIndex]
  );

  const isActiveFileLoading = activeFileId ? loadingFileIds.has(activeFileId) : false;

  const editorValue = useMemo(() => {
    if (!activeFile) return '';
    return fileContents[activeFile.id] ?? generatePlaceholder(activeFile);
  }, [activeFile, fileContents]);

  const editorLanguage = useMemo(
    () => toMonacoLanguage(activeFile?.language),
    [activeFile]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFileId) return;
      setDraftContent(activeFileId, value ?? '');
    },
    [activeFileId, setDraftContent]
  );

  const handleSave = useCallback(() => {
    void saveActiveFile();
  }, [saveActiveFile]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const breadcrumb = useMemo(() => {
    if (!activeFile) return [];
    return activeFile.path.split('/').filter(Boolean);
  }, [activeFile]);

  return (
    <div className="filesview animate-fade-in">
      {/* ---- Editor area ---- */}
      <section className="filesview__editor-area">
        {/* Tab bar */}
        <div className="filesview__tabs" role="tablist" aria-label="Open files">
          {openFiles.map((file) => {
            const TabIcon = fileIconFor(file);
            const isActive = file.id === activeFileId;
            return (
              <div
                key={file.id}
                role="tab"
                aria-selected={isActive}
                className={[
                  'filesview__tab',
                  isActive ? 'filesview__tab--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveFile(file.id)}
                title={file.path}
              >
                <span className="filesview__tab-icon">
                  <TabIcon size={14} />
                </span>
                <span className="filesview__tab-name">{file.name}</span>
                {dirtyFileIds.has(file.id) && <span className="filesview__tab-dot" aria-label="Modified" />}
                <button
                  type="button"
                  className="filesview__tab-close"
                  aria-label={`Close ${file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.id);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {activeFile ? (
          <>
            {/* Editor toolbar */}
            <div className="filesview__toolbar">
              <nav className="filesview__breadcrumb" aria-label="File path">
                {breadcrumb.map((crumb, i) => (
                  <span key={`${crumb}-${i}`} className="filesview__crumb">
                    <span
                      className={
                        i === breadcrumb.length - 1
                          ? 'filesview__crumb-text filesview__crumb-text--current'
                          : 'filesview__crumb-text'
                      }
                    >
                      {crumb}
                    </span>
                    {i < breadcrumb.length - 1 && (
                      <ChevronRight size={12} className="filesview__crumb-sep" />
                    )}
                  </span>
                ))}
              </nav>
              <div className="filesview__toolbar-actions">
                <IconButton
                  icon={<Sidebar size={16} />}
                  tooltip="Toggle Sidebar (Ctrl+B)"
                  tooltipSide="bottom"
                  variant="ghost"
                  active={sidebarVisible}
                  size="sm"
                  onClick={toggleSidebar}
                />
                <IconButton
                  icon={<Save size={16} />}
                  tooltip="Save file (Ctrl+S)"
                  tooltipSide="bottom"
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                />
              </div>
            </div>

            {/* Monaco editor — single instance, props swapped per tab */}
            <div className="filesview__monaco">
              {isActiveFileLoading ? (
                <div className="filesview__monaco-loading">
                  <Spinner size="md" />
                </div>
              ) : (
                <Editor
                  theme="vs-dark"
                  path={activeFile.id}
                  language={editorLanguage}
                  value={editorValue}
                  onChange={handleEditorChange}
                  options={{
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                    minimap: { enabled: true, scale: 1, maxColumn: 60 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    readOnly: false,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    renderLineHighlight: 'all',
                    padding: { top: 12, bottom: 12 },
                    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="filesview__empty">
            <div className="filesview__empty-icon">
              <FileCode size={40} />
            </div>
            <p className="filesview__empty-title">No file open</p>
            <p className="filesview__empty-hint">
              Select a file from the explorer to start editing.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
