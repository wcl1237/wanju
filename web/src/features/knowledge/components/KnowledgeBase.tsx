import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { KnowledgeDoc, SearchResult, ChunkItem } from '../types';
import * as knowledgeApi from '../api';

const ACCEPTED_EXTENSIONS = ['.md', '.txt', '.text', '.markdown'];

const KnowledgeBase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Chunk viewing
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await knowledgeApi.getDocs());
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ==================== 文件处理 ====================

  const isValidFile = (file: File): boolean => {
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext));
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const validFiles = Array.from(files).filter(isValidFile);
    if (validFiles.length < files.length) {
      setError(`部分文件格式不支持，仅支持 ${ACCEPTED_EXTENSIONS.join(', ')}`);
    }
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`读取文件 ${file.name} 失败`));
      reader.readAsText(file, 'utf-8');
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || uploading) return;
    setUploading(true);
    setError(null);

    let successCount = 0;
    const total = selectedFiles.length;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`正在上传 (${i + 1}/${total}): ${file.name}`);

      try {
        const content = await readFileContent(file);
        await knowledgeApi.uploadDoc(file.name, content);
        successCount++;
      } catch (err) {
        setError(err instanceof Error ? err.message : `上传 ${file.name} 失败`);
      }
    }

    setUploadProgress(null);
    setSelectedFiles([]);
    setUploading(false);

    if (successCount > 0) {
      await fetchDocs();
    }
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDelete = async (id: string) => {
    try {
      await knowledgeApi.deleteDoc(id);
      if (expandedDocId === id) {
        setExpandedDocId(null);
        setChunks([]);
      }
      await fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  const toggleChunks = async (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      setChunks([]);
      return;
    }
    setExpandedDocId(docId);
    setChunksLoading(true);
    try {
      setChunks(await knowledgeApi.getChunks(docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取分片失败');
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setSearchResults(await knowledgeApi.searchKnowledge(searchQuery.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSearching(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>📚 知识库管理</h3>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['documents', 'search'] as const).map((tab) => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'documents' ? '📄 文档列表' : '🔍 搜索'}
          </button>
        ))}
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button style={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div style={styles.content}>
        {activeTab === 'documents' ? (
          <>
            {/* File Upload Zone */}
            <div style={styles.uploadSection}>
              <h4 style={styles.sectionTitle}>上传文档</h4>
              <p style={styles.uploadHint}>
                支持 .md、.txt 文件 · Markdown 文件自动结构化切片 · 纯文本自动语义化切片
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.text,.markdown"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFileSelect(e.target.files);
                  e.target.value = '';
                }}
              />

              {/* Drop Zone */}
              <div
                style={{
                  ...styles.dropZone,
                  ...(dragOver ? styles.dropZoneActive : {}),
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div style={styles.dropIcon}>
                  {dragOver ? '📥' : '📂'}
                </div>
                <div style={styles.dropText}>
                  {dragOver ? '松开以添加文件' : '点击选择文件或拖拽到此处'}
                </div>
                <div style={styles.dropSubtext}>
                  支持同时上传多个文件
                </div>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div style={styles.fileList}>
                  {selectedFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} style={styles.fileItem}>
                      <div style={styles.fileInfo}>
                        <span style={styles.fileIcon}>
                          {file.name.endsWith('.md') || file.name.endsWith('.markdown') ? '📝' : '📄'}
                        </span>
                        <div style={styles.fileDetails}>
                          <span style={styles.fileName}>{file.name}</span>
                          <span style={styles.fileMeta}>
                            {formatFileSize(file.size)}
                            {' · '}
                            {file.name.endsWith('.md') || file.name.endsWith('.markdown')
                              ? '结构化切片'
                              : '语义化切片'}
                          </span>
                        </div>
                      </div>
                      <button
                        style={styles.fileRemoveBtn}
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Progress */}
              {uploadProgress && (
                <div style={styles.progressBar}>
                  <div style={styles.progressPulse} />
                  <span style={styles.progressText}>{uploadProgress}</span>
                </div>
              )}

              {/* Upload Button */}
              <button
                style={{
                  ...styles.uploadButton,
                  opacity: selectedFiles.length > 0 && !uploading ? 1 : 0.4,
                  cursor: selectedFiles.length > 0 && !uploading ? 'pointer' : 'default',
                }}
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || uploading}
              >
                {uploading
                  ? '⏳ 上传并向量化中...'
                  : `📤 上传 ${selectedFiles.length > 0 ? `${selectedFiles.length} 个文件` : '文件'}`}
              </button>
            </div>

            {/* Document List */}
            <div style={styles.listSection}>
              <h4 style={styles.sectionTitle}>
                已上传文档
                <span style={styles.docCount}>{docs.length}</span>
              </h4>
              {loading ? (
                <div style={styles.loadingState}>加载中...</div>
              ) : docs.length === 0 ? (
                <div style={styles.emptyState}>
                  <span style={{ fontSize: '32px', opacity: 0.3 }}>📭</span>
                  <p style={styles.emptyText}>暂无文档</p>
                  <p style={styles.emptySubtext}>上传文档以构建知识库</p>
                </div>
              ) : (
                <div style={styles.docList}>
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        ...styles.docItem,
                        borderColor:
                          hoveredDoc === doc.id || expandedDocId === doc.id
                            ? 'rgba(99, 102, 241, 0.2)'
                            : 'rgba(255, 255, 255, 0.06)',
                        background:
                          expandedDocId === doc.id
                            ? 'rgba(99, 102, 241, 0.08)'
                            : hoveredDoc === doc.id
                            ? 'rgba(99, 102, 241, 0.06)'
                            : 'rgba(255, 255, 255, 0.03)',
                        cursor: 'pointer',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                      }}
                      onMouseEnter={() => setHoveredDoc(doc.id)}
                      onMouseLeave={() => setHoveredDoc(null)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div
                          style={styles.docInfo}
                          onClick={() => toggleChunks(doc.id)}
                        >
                          <span style={styles.docIcon}>
                            {doc.name.endsWith('.md') || doc.name.endsWith('.markdown') ? '📝' : '📄'}
                          </span>
                          <div style={styles.docDetails}>
                            <span style={styles.docName}>{doc.name}</span>
                            <span style={styles.docMeta}>
                              {doc.chunkCount} 个切片 · {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                              {expandedDocId === doc.id ? ' · 点击收起' : ' · 点击查看分片'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={styles.expandIcon}>
                            {expandedDocId === doc.id ? '▲' : '▼'}
                          </span>
                          <button
                            style={styles.deleteBtn}
                            onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                              e.currentTarget.style.color = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)';
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Chunk list */}
                      {expandedDocId === doc.id && (
                        <div style={styles.chunksContainer}>
                          {chunksLoading ? (
                            <div style={styles.chunksLoading}>加载分片中...</div>
                          ) : chunks.length === 0 ? (
                            <div style={styles.chunksLoading}>无分片数据</div>
                          ) : (
                            chunks.map((chunk) => (
                              <div key={chunk.id} style={styles.chunkCard}>
                                <div style={styles.chunkHeader}>
                                  <span style={styles.chunkIndex}>#{chunk.index}</span>
                                  <span style={styles.chunkMeta}>{chunk.charCount} 字符</span>
                                </div>
                                <p style={styles.chunkContent}>{chunk.content}</p>
                                {chunk.keywords.length > 0 && (
                                  <div style={styles.chunkKeywords}>
                                    {chunk.keywords.slice(0, 8).map((kw, i) => (
                                      <span key={i} style={styles.keywordTag}>{kw}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Search Tab */
          <div style={styles.searchSection}>
            <div style={styles.searchInputRow}>
              <input
                style={styles.searchInput}
                type="text"
                placeholder="输入搜索关键词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                style={{
                  ...styles.searchButton,
                  opacity: searchQuery.trim() && !searching ? 1 : 0.5,
                }}
                onClick={handleSearch}
                disabled={!searchQuery.trim() || searching}
              >
                {searching ? '搜索中...' : '搜索'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={styles.resultsList}>
                <h4 style={styles.sectionTitle}>
                  搜索结果
                  <span style={styles.docCount}>{searchResults.length}</span>
                </h4>
                {searchResults.map((result, idx) => (
                  <div key={result.id || idx} style={styles.resultCard}>
                    <div style={styles.resultHeader}>
                      {result.docName && (
                        <span style={styles.resultDocName}>📄 {result.docName}</span>
                      )}
                      <span style={styles.resultScore}>
                        相关度 {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p style={styles.resultContent}>{result.content}</p>
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <div style={styles.emptyState}>
                <span style={{ fontSize: '32px', opacity: 0.3 }}>🔍</span>
                <p style={styles.emptyText}>未找到相关结果</p>
                <p style={styles.emptySubtext}>尝试使用不同的关键词</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 28px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
  },
  tabs: {
    display: 'flex',
    padding: '0 28px',
    gap: '4px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
  },
  activeTab: {
    color: '#a78bfa',
    borderBottomColor: '#8b5cf6',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
    fontSize: '12px',
    color: '#fca5a5',
    fontFamily: "'Inter', sans-serif",
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#fca5a5',
    cursor: 'pointer',
    padding: '2px',
    fontSize: '12px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 28px',
  },

  // Upload section
  uploadSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  uploadHint: {
    margin: 0,
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.5,
  },

  // Drop zone
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '28px 16px',
    borderRadius: '12px',
    border: '2px dashed rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.02)',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  dropZoneActive: {
    border: '2px dashed rgba(139, 92, 246, 0.5)',
    background: 'rgba(139, 92, 246, 0.06)',
  },
  dropIcon: {
    fontSize: '28px',
    transition: 'transform 0.2s ease',
  },
  dropText: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "'Inter', sans-serif",
  },
  dropSubtext: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.25)',
    fontFamily: "'Inter', sans-serif",
  },

  // File list
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(99, 102, 241, 0.06)',
    border: '1px solid rgba(99, 102, 241, 0.1)',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  fileIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },
  fileDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  fileName: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: "'Inter', sans-serif",
  },
  fileRemoveBtn: {
    width: '22px',
    height: '22px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '10px',
    flexShrink: 0,
    padding: 0,
    transition: 'all 0.15s ease',
  },

  // Progress
  progressBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.12)',
  },
  progressPulse: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#8b5cf6',
    animation: 'toolPulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  progressText: {
    fontSize: '12px',
    color: '#a78bfa',
    fontFamily: "'Inter', sans-serif",
  },

  // Upload button
  uploadButton: {
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.2s ease',
  },

  // Document list
  docCount: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.3)',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  listSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  loadingState: {
    padding: '24px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px',
    gap: '4px',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: "'Inter', sans-serif",
  },
  emptySubtext: {
    margin: 0,
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: "'Inter', sans-serif",
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  docItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    transition: 'all 0.2s ease',
  },
  docInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: 0,
  },
  docIcon: {
    fontSize: '18px',
    flexShrink: 0,
  },
  docDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  docName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  docMeta: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: "'Inter', sans-serif",
  },
  deleteBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'rgba(255, 255, 255, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: '13px',
    flexShrink: 0,
    padding: 0,
  },

  // Search tab
  searchSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  searchInputRow: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
  },
  searchButton: {
    padding: '10px 18px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  resultCard: {
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  resultDocName: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#a78bfa',
    fontFamily: "'Inter', sans-serif",
  },
  resultScore: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    background: 'rgba(99, 102, 241, 0.1)',
    padding: '2px 8px',
    borderRadius: '8px',
    fontFamily: "'Inter', sans-serif",
  },
  resultContent: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: "'Inter', sans-serif",
  },

  // Expand icon
  expandIcon: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
    transition: 'transform 0.2s ease',
  },

  // Chunk viewing
  chunksContainer: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto' as const,
  },
  chunksLoading: {
    padding: '12px',
    textAlign: 'center' as const,
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '12px',
    fontFamily: "'Inter', sans-serif",
  },
  chunkCard: {
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    borderLeft: '3px solid rgba(139, 92, 246, 0.4)',
  },
  chunkHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  chunkIndex: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#a78bfa',
    fontFamily: "'Inter', sans-serif",
  },
  chunkMeta: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.25)',
    fontFamily: "'Inter', sans-serif",
  },
  chunkContent: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "'Inter', 'PingFang SC', sans-serif",
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  chunkKeywords: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '8px',
  },
  keywordTag: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    background: 'rgba(99, 102, 241, 0.1)',
    color: 'rgba(167, 139, 250, 0.7)',
    fontFamily: "'Inter', sans-serif",
  },
};

export default KnowledgeBase;
