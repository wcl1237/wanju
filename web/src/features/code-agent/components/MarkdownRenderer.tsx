/**
 * MarkdownRenderer — Code Agent 消息的 Markdown 渲染器
 *
 * 支持：标题、列表、粗体/斜体、代码块（语法高亮）、表格、链接等
 * 暗色主题适配
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="markdown-body" style={markdownStyles.container}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // 代码块
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !codeString.includes('\n');

            if (isInline) {
              return (
                <code style={markdownStyles.inlineCode} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match ? match[1] : 'text'}
                PreTag="div"
                customStyle={markdownStyles.codeBlock}
              >
                {codeString}
              </SyntaxHighlighter>
            );
          },

          // 标题
          h1: ({ children }) => <h1 style={markdownStyles.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={markdownStyles.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={markdownStyles.h3}>{children}</h3>,
          h4: ({ children }) => <h4 style={markdownStyles.h4}>{children}</h4>,

          // 段落
          p: ({ children }) => <pre style={markdownStyles.p}>{children}</pre>,

          // 列表
          ul: ({ children }) => <ul style={markdownStyles.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={markdownStyles.ol}>{children}</ol>,
          li: ({ children }) => <li style={markdownStyles.li}>{children}</li>,

          // 链接
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={markdownStyles.a}>
              {children}
            </a>
          ),

          // 强调
          strong: ({ children }) => <strong style={markdownStyles.strong}>{children}</strong>,
          em: ({ children }) => <em style={markdownStyles.em}>{children}</em>,

          // 表格
          table: ({ children }) => (
            <div style={markdownStyles.tableWrapper}>
              <table style={markdownStyles.table}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={markdownStyles.thead}>{children}</thead>,
          th: ({ children }) => <th style={markdownStyles.th}>{children}</th>,
          td: ({ children }) => <td style={markdownStyles.td}>{children}</td>,

          // 分隔线
          hr: () => <hr style={markdownStyles.hr} />,

          // 引用
          blockquote: ({ children }) => (
            <blockquote style={markdownStyles.blockquote}>{children}</blockquote>
          ),

          // 预格式化文本
          pre: ({ children }) => (
            <pre style={markdownStyles.pre}>{children}</pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// ─── 暗色主题样式 ─────────────────────────────────

const markdownStyles: Record<string, React.CSSProperties> = {
  container: {
    fontSize: '14px',
    lineHeight: 1.7,
    color: '#e2e8f0',
    wordBreak: 'break-word',
  },
  h1: {
    fontSize: '20px',
    fontWeight: 700,
    margin: '16px 0 8px',
    color: '#f1f5f9',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: '6px',
  },
  h2: {
    fontSize: '17px',
    fontWeight: 700,
    margin: '14px 0 6px',
    color: '#f1f5f9',
  },
  h3: {
    fontSize: '15px',
    fontWeight: 600,
    margin: '12px 0 4px',
    color: '#e2e8f0',
  },
  h4: {
    fontSize: '14px',
    fontWeight: 600,
    margin: '10px 0 4px',
    color: '#cbd5e1',
  },
  p: {
    margin: '6px 0',
  },
  ul: {
    margin: '6px 0',
    paddingLeft: '20px',
  },
  ol: {
    margin: '6px 0',
    paddingLeft: '20px',
  },
  li: {
    margin: '3px 0',
  },
  a: {
    color: '#38bdf8',
    textDecoration: 'none',
  },
  strong: {
    color: '#f1f5f9',
    fontWeight: 600,
  },
  em: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  inlineCode: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: '#fbbf24',
  },
  codeBlock: {
    borderRadius: '8px',
    fontSize: '13px',
    margin: '8px 0',
    padding: '12px',
    background: 'rgba(0,0,0,0.4)',
  },
  tableWrapper: {
    overflowX: 'auto',
    margin: '8px 0',
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '13px',
  },
  thead: {
    background: 'rgba(255,255,255,0.05)',
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: '#cbd5e1',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    margin: '12px 0',
  },
  blockquote: {
    borderLeft: '3px solid rgba(56,189,248,0.4)',
    margin: '8px 0',
    padding: '4px 12px',
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '0 6px 6px 0',
  },
  pre: {
    background: 'rgba(0,0,0,0.35)',
    borderRadius: '8px',
    padding: '12px',
    margin: '8px 0',
    overflow: 'auto',
    fontSize: '13px',
    lineHeight: 1.5,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

export default MarkdownRenderer;
