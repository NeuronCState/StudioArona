import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface TokenStreamProps {
  content: string;
  isStreaming: boolean;
}

const chunkDelimiters = /([。！？\n])/;

function splitIntoChunks(text: string): string[] {
  const parts = text.split(chunkDelimiters);
  const chunks: string[] = [];
  let buf = '';
  for (const part of parts) {
    buf += part;
    if (chunkDelimiters.test(part) || buf.length > 40) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks;
}

// Static chunks rendered once — only re-renders when finalized
const StaticChunks = memo(function StaticChunks({ chunks }: { chunks: string[] }) {
  return (
    <>
      {chunks.map((chunk, i) => (
        <Markdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {chunk}
        </Markdown>
      ))}
    </>
  );
});

export function TokenStream({ content, isStreaming }: TokenStreamProps) {
  const chunks = useMemo(() => {
    if (!isStreaming || !content) return null;
    return splitIntoChunks(content);
  }, [content, isStreaming]);

  // Completed — render full markdown
  if (!isStreaming || !content) {
    return (
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content || '...'}
      </Markdown>
    );
  }

  // Streaming — render older chunks static, last chunk animated
  if (!chunks || chunks.length === 0) {
    return (
      <span>
        {content}
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor-blink bg-[var(--color-accent)] align-middle" />
      </span>
    );
  }

  const lastIdx = chunks.length - 1;
  const olderChunks = chunks.slice(0, lastIdx);
  const lastChunk = chunks[lastIdx];

  return (
    <div>
      {olderChunks.length > 0 && <StaticChunks chunks={olderChunks} />}
      <motion.span
        key={lastIdx}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{ display: 'inline' }}
      >
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {lastChunk}
        </Markdown>
      </motion.span>
      <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor-blink bg-[var(--color-accent)] align-middle" />
    </div>
  );
}
