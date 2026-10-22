'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FormEvent } from 'react';
import { useTelegram } from '@/context/TelegramContext';
import type {
  TelegramComment,
  TelegramCommentContentBlock,
  TelegramCommentDraftBlock,
} from '@/lib/telegramComments';
import { buildCommentThreadHashtag } from '@/lib/commentThread';
import { getCachedProfilePicUrl } from '@/lib/telegramComments';

type Comment = TelegramComment;
type CommentSortOption = 'recientes' | 'antiguos' | 'populares' | 'respuestas';

const commentSortLabels: Record<CommentSortOption, string> = {
  recientes: 'Más recientes',
  antiguos: 'Más antiguos',
  populares: 'Más populares',
  respuestas: 'Más respuestas',
};

type FormatKind = 'bold' | 'italic' | 'emoji';

function FormatIcon({ kind }: { kind: FormatKind }) {
  if (kind === 'bold') return <span className="font-black">B</span>;
  if (kind === 'italic') return <span className="font-serif italic">I</span>;
  return <span aria-hidden="true">☺</span>;
}

type TextPart =
  | { kind: 'text'; value: string }
  | { kind: 'spoiler' | 'bold' | 'italic'; value: string };

function parseFormattedText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const formatting = /(\|\|[\s\S]+?\|\||\*\*[\s\S]+?\*\*|__[\s\S]+?__)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(formatting)) {
    const value = match[0];
    const start = match.index;
    if (start > lastIndex) parts.push({ kind: 'text', value: text.slice(lastIndex, start) });

    if (value.startsWith('||')) parts.push({ kind: 'spoiler', value: value.slice(2, -2) });
    else if (value.startsWith('**')) parts.push({ kind: 'bold', value: value.slice(2, -2) });
    else parts.push({ kind: 'italic', value: value.slice(2, -2) });
    lastIndex = start + value.length;
  }

  if (lastIndex < text.length) parts.push({ kind: 'text', value: text.slice(lastIndex) });
  return parts;
}

function SpoilerText({ text }: { text: string }) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <button
      type="button"
      aria-label={isRevealed ? 'Ocultar spoiler' : 'Revelar spoiler'}
      aria-pressed={isRevealed}
      onClick={() => setIsRevealed((current) => !current)}
      className={`rounded px-1 transition-colors duration-300 ${
        isRevealed
          ? 'bg-gray-700 text-white'
          : 'cursor-pointer bg-gray-700 text-transparent hover:text-white'
      }`}
    >
      {text}
    </button>
  );
}

function renderFormattedText(
  text: string,
  keyPrefix: string,
  onExternalLink: (url: string) => void,
): ReactNode {
  const parts: ReactNode[] = [];
  const links = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;

  const appendText = (value: string, key: string) => {
    const lines = value.split('\n');
    lines.forEach((line, index) => {
      parts.push(<Fragment key={`${key}-line-${index}`}>{line}{index < lines.length - 1 && <br />}</Fragment>);
    });
  };

  for (const [index, match] of [...text.matchAll(links)].entries()) {
    const start = match.index;
    if (start > lastIndex) appendText(text.slice(lastIndex, start), `${keyPrefix}-text-${index}`);

    const href = match[2] ?? match[3];
    const label = match[1] ?? href;
    parts.push(
      <button
        type="button"
        key={`${keyPrefix}-link-${index}`}
        className="cursor-pointer text-blue-400 hover:underline"
        onClick={() => {
          try {
            if (localStorage.getItem('skipLinkWarning') === 'true') {
              window.open(href, '_blank', 'noopener,noreferrer');
              return;
            }
          } catch (error) {
            console.error('No se pudo leer la preferencia de enlaces externos.', error);
          }
          onExternalLink(href);
        }}
      >
        {label}
      </button>,
    );
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) appendText(text.slice(lastIndex), `${keyPrefix}-text-end`);
  return parts;
}

function FormattedText({
  text,
  onExternalLink,
}: {
  text: string;
  onExternalLink: (url: string) => void;
}) {
  return (
    <>
      {parseFormattedText(text).map((part, index) => {
        if (part.kind === 'spoiler') return <SpoilerText key={index} text={part.value} />;
        if (part.kind === 'bold') return <strong key={index} className="font-bold text-gray-200">{part.value}</strong>;
        if (part.kind === 'italic') return <em key={index} className="italic">{part.value}</em>;
        return (
          <Fragment key={index}>
            {renderFormattedText(part.value, `formatted-${index}`, onExternalLink)}
          </Fragment>
        );
      })}
    </>
  );
}

function countComments(comments: Comment[]): number {
  return comments.reduce((total, comment) => total + 1 + countComments(comment.replies), 0);
}

function isCachedComment(value: unknown): value is Comment {
  if (typeof value !== 'object' || value === null) return false;
  const comment = value as Partial<Comment>;
  return typeof comment.id === 'string' &&
    typeof comment.userId === 'string' &&
    typeof comment.username === 'string' &&
    typeof comment.avatar === 'string' &&
    typeof comment.text === 'string' &&
    (comment.mediaUrls === undefined ||
      (Array.isArray(comment.mediaUrls) && comment.mediaUrls.every((url) => typeof url === 'string'))) &&
    (comment.messageIds === undefined ||
      (Array.isArray(comment.messageIds) && comment.messageIds.every((id) => typeof id === 'string'))) &&
    comment.userId !== 'unknown' &&
    comment.username !== 'Usuario Desconocido' &&
    comment.username !== comment.userId &&
    !/^-?\d+$/.test(comment.username) &&
    typeof comment.likes === 'number' &&
    Array.isArray(comment.replies) &&
    comment.replies.every(isCachedComment);
}

function withoutCachedMediaUrls(comments: Comment[]): Comment[] {
  return comments.map((comment) => ({
    ...comment,
    mediaUrls: [],
    contentBlocks: undefined,
    messageIds: comment.messageIds ?? [comment.id],
    replies: withoutCachedMediaUrls(comment.replies),
  }));
}

function collectCommentMessageIds(comments: Comment[], commentId: string): string[] | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      const messageIds = new Set(comment.messageIds ?? [comment.id]);
      const collectReplies = (replies: Comment[]) => replies.forEach((reply) => {
        (reply.messageIds ?? [reply.id]).forEach((id) => messageIds.add(id));
        collectReplies(reply.replies);
      });
      collectReplies(comment.replies);
      return [...messageIds];
    }

    const nestedIds = collectCommentMessageIds(comment.replies, commentId);
    if (nestedIds) return nestedIds;
  }
  return null;
}

function removeCommentsByIds(comments: Comment[], commentIds: Set<string>): Comment[] {
  return comments
    .filter((comment) => !commentIds.has(comment.id))
    .map((comment) => ({
      ...comment,
      replies: removeCommentsByIds(comment.replies, commentIds),
    }));
}

function mergeCommentsByAlbum(current: Comment[], incoming: Comment[]): Comment[] {
  const merged = [...current];
  incoming.forEach((comment) => {
    const existing = merged.find((item) =>
      item.id === comment.id ||
      (comment.contentGroupId !== undefined && item.contentGroupId === comment.contentGroupId) ||
      (comment.groupedId !== undefined && item.groupedId === comment.groupedId),
    );
    if (!existing) {
      merged.push(comment);
      return;
    }

    existing.mediaUrls = [...new Set([...existing.mediaUrls, ...comment.mediaUrls])];
    existing.messageIds = [...new Set([...existing.messageIds, ...comment.messageIds])];
    existing.contentBlocks = [...(existing.contentBlocks ?? []), ...(comment.contentBlocks ?? [])]
      .filter((block, index, blocks) => blocks.findIndex((candidate) =>
        candidate.messageId === block.messageId && candidate.kind === block.kind,
      ) === index)
      .sort((left, right) => {
        if (left.index !== right.index) return left.index - right.index;
        if (left.kind === right.kind) return 0;
        return left.kind === 'text' ? -1 : 1;
      });
    if (existing.contentBlocks.length > 0) {
      existing.text = existing.contentBlocks
        .filter((block): block is Extract<TelegramCommentContentBlock, { kind: 'text' }> => block.kind === 'text')
        .map((block) => block.text)
        .join('\n');
    }
    if (!existing.text && comment.text) existing.text = comment.text;
    existing.replies = mergeCommentsByAlbum(existing.replies, comment.replies);
  });
  return merged;
}

function isCommentOwner(commentUserId: string, currentUserId: string | null) {
  return currentUserId !== null &&
    commentUserId.trim() !== '' &&
    String(commentUserId) === String(currentUserId);
}

function commentToDraftBlocks(comment: Comment): TelegramCommentDraftBlock[] {
  const blocks: TelegramCommentDraftBlock[] = [];
  const assignedMessageIds = new Set<string>();
  if (comment.contentBlocks?.length) {
    for (const block of comment.contentBlocks) {
      const useMessageId = !assignedMessageIds.has(block.messageId);
      assignedMessageIds.add(block.messageId);
      blocks.push(block.kind === 'text'
        ? {
          kind: 'text',
          text: block.text,
          originalText: block.text,
          originalIndex: block.index,
          ...(useMessageId ? { messageId: block.messageId } : {}),
        }
        : {
          kind: 'image',
          mediaUrl: block.mediaUrl,
          isSpoiler: block.isSpoiler,
          originalIsSpoiler: block.isSpoiler,
          originalIndex: block.index,
          ...(useMessageId ? { messageId: block.messageId } : {}),
        });
    }
    return blocks;
  }

  if (comment.text.trim()) blocks.push({ kind: 'text', text: comment.text, messageId: comment.id });
  comment.mediaUrls.forEach((mediaUrl, index) => blocks.push({
    kind: 'image',
    mediaUrl,
    isSpoiler: false,
    ...(index === 0 && blocks.length === 0 ? { messageId: comment.id } : {}),
  }));
  return blocks.length > 0 ? blocks : [{ kind: 'text', text: '', messageId: comment.id }];
}

function normalizeDraftBlocks(blocks: TelegramCommentDraftBlock[]): TelegramCommentDraftBlock[] {
  const normalized: TelegramCommentDraftBlock[] = [];
  blocks.forEach((block) => {
    if (block.kind === 'image') {
      normalized.push({ ...block });
      return;
    }

    const previous = normalized[normalized.length - 1];
    if (previous?.kind === 'text') {
      previous.text += block.text;
      previous.messageId ??= block.messageId;
    } else if (block.text !== '') {
      normalized.push({ ...block });
    }
  });

  if (normalized.length === 0 || normalized[normalized.length - 1].kind !== 'text') {
    normalized.push({ kind: 'text', text: '' });
  }
  return normalized;
}

function CommentAvatar({ comment }: { comment: Comment }) {
  const { getProfilePic } = useTelegram();
  const [profileUrl, setProfileUrl] = useState<string | null>(
    () => getCachedProfilePicUrl(comment.userId),
  );

  useEffect(() => {
    let cancelled = false;
    void getProfilePic(comment.userId).then((url) => {
      if (!url) return;
      if (!cancelled) setProfileUrl(url);
    }).catch((error: unknown) => {
      console.error(`No se pudo cargar el avatar de ${comment.username}.`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [comment.userId, comment.username, getProfilePic]);

  return (
    <div className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${comment.color} text-xs font-bold text-white shadow-lg`}>
      {profileUrl ? (
        <img src={profileUrl} alt="" className="h-full w-full object-cover" />
      ) : comment.avatar}
    </div>
  );
}

function CommentItem({
  comment,
  onSubmitReply,
  onEdit,
  onRequestDelete,
  onExternalLink,
  currentUserId,
}: {
  comment: Comment;
  onSubmitReply: (blocks: TelegramCommentDraftBlock[], replyToMessageId: string) => Promise<void>;
  onEdit: (comment: Comment, blocks: TelegramCommentDraftBlock[]) => Promise<void>;
  onRequestDelete: (commentId: string) => void;
  onExternalLink: (url: string) => void;
  currentUserId: string | null;
  isNested?: boolean;
}) {
  const commentItemRef = useRef<HTMLDivElement>(null);
  const connectorRef = useRef<HTMLDivElement>(null);
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const [hiddenConnectorHeight, setHiddenConnectorHeight] = useState(56);
  const [isRepliesHidden, setIsRepliesHidden] = useState(true);
  const [isConnectorHovered, setIsConnectorHovered] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [likes, setLikes] = useState(comment.likes);
  const [dislikes, setDislikes] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [hasDisliked, setHasDisliked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(() => new Set());
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const contentBlocks: TelegramCommentContentBlock[] = comment.contentBlocks?.length
    ? comment.contentBlocks
    : [
      ...(comment.text
        ? [{ kind: 'text' as const, text: comment.text, messageId: comment.id, index: 0 }]
        : []),
      ...comment.mediaUrls.map((mediaUrl, index) => ({
        kind: 'image' as const,
        mediaUrl,
        messageId: `${comment.id}-media-${index}`,
        isSpoiler: false,
        index,
      })),
    ];
  const imageCount = contentBlocks.filter((block) => block.kind === 'image').length;
  const canCollapseContent = imageCount > 1;
  const firstImageIndex = contentBlocks.findIndex((block) => block.kind === 'image');
  const visibleContentBlocks = canCollapseContent && !isContentExpanded
    ? contentBlocks.slice(0, firstImageIndex + 1)
    : contentBlocks;

  useEffect(() => {
    if (!comment.replies.length || !isRepliesHidden) return;
    const commentItem = commentItemRef.current;
    const connector = connectorRef.current;
    const replyButton = replyButtonRef.current;
    if (!commentItem || !connector || !replyButton) return;

    const updateConnectorHeight = () => {
      const connectorTop = connector.getBoundingClientRect().top;
      const buttonRect = replyButton.getBoundingClientRect();
      setHiddenConnectorHeight(Math.max(0, buttonRect.top + buttonRect.height / 2 - connectorTop));
    };

    updateConnectorHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateConnectorHeight);
    observer.observe(commentItem);
    observer.observe(replyButton);
    return () => observer.disconnect();
  }, [comment.id, comment.replies.length, isRepliesHidden, isReplying]);

  const toggleLike = () => {
    if (hasLiked) {
      setLikes((current) => current - 1);
      setHasLiked(false);
      return;
    }

    setLikes((current) => current + 1);
    setHasLiked(true);
    if (hasDisliked) {
      setDislikes((current) => current - 1);
      setHasDisliked(false);
    }
  };

  const toggleDislike = () => {
    if (hasDisliked) {
      setDislikes((current) => current - 1);
      setHasDisliked(false);
      return;
    }

    setDislikes((current) => current + 1);
    setHasDisliked(true);
    if (hasLiked) {
      setLikes((current) => current - 1);
      setHasLiked(false);
    }
  };

  const saveEdit = async (blocks: TelegramCommentDraftBlock[]) => {
    setIsSavingEdit(true);
    setEditError('');
    try {
      await onEdit(comment, blocks);
      setIsEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setIsSavingEdit(false);
    }
  };

  const submitReply = async (blocks: TelegramCommentDraftBlock[]) => {
    if (isSendingReply) return;
    setIsSendingReply(true);
    setReplyError('');
    try {
      await onSubmitReply(blocks, comment.id);
      setIsReplying(false);
      setIsRepliesHidden(false);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div ref={commentItemRef} id={`comment-${comment.id}`} className="group relative mt-4 scroll-mt-24">
      {comment.replies.length > 0 && (
        <div
          ref={connectorRef}
          role="button"
          tabIndex={0}
          aria-label={isRepliesHidden ? 'Mostrar respuestas' : 'Ocultar respuestas'}
          aria-expanded={!isRepliesHidden}
          className={`after:absolute after:-left-3 after:top-0 after:h-full after:w-3 after:content-[''] absolute z-20 cursor-pointer rounded-bl-3xl border-l-2 border-b-2 bg-transparent p-0 transition-colors ${
            isConnectorHovered ? 'border-white' : 'border-gray-700'
          }`}
          style={{
            left: '1.05rem',
            top: '2.5rem',
            width: '1.45rem',
            bottom: isRepliesHidden ? 'auto' : '1rem',
            height: isRepliesHidden ? `${hiddenConnectorHeight}px` : 'auto',
          }}
          onClick={() => setIsRepliesHidden((hidden) => !hidden)}
          onMouseEnter={() => setIsConnectorHovered(true)}
          onMouseLeave={() => setIsConnectorHovered(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsRepliesHidden((hidden) => !hidden);
            }
          }}
          title={isRepliesHidden ? 'Mostrar respuestas' : 'Ocultar respuestas'}
        />
      )}
      <div className="relative z-10 flex gap-3">
        <div className="z-10 shrink-0">
          <CommentAvatar comment={comment} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold text-white">{comment.username}</h3>
              <time className="text-xs text-gray-500">{comment.time}</time>
            </div>
            {isEditing ? (
              <div className="mt-2">
                <RichCommentComposer
                  initialBlocks={commentToDraftBlocks(comment)}
                  error={editError}
                  isSubmitting={isSavingEdit}
                  submitLabel="Guardar"
                  variant="inline"
                  contextLabel="Editando comentario"
                  onSubmit={saveEdit}
                  onCancel={() => {
                    setEditError('');
                    setIsEditing(false);
                  }}
                />
              </div>
            ) : contentBlocks.length > 0 ? (
              <div className="mt-1 space-y-2">
                {visibleContentBlocks.map((block, index) => {
                  if (block.kind === 'text') {
                    return (
                      <p key={`${comment.id}-text-${index}`} className="whitespace-pre-wrap text-sm leading-6 text-gray-300">
                        <FormattedText text={block.text} onExternalLink={onExternalLink} />
                      </p>
                    );
                  }

                  const isSpoilerHidden = block.isSpoiler && !revealedSpoilers.has(block.messageId);
                  return (
                    <div key={`${comment.id}-image-${index}`} className="relative mt-2 w-fit max-w-full">
                      <img
                        src={block.mediaUrl}
                        alt={isSpoilerHidden ? 'Imagen marcada como spoiler' : 'Imagen adjunta al comentario'}
                        className={`max-h-60 max-w-full rounded-lg object-cover transition-all ${
                          isSpoilerHidden ? 'blur-xl' : 'cursor-pointer hover:scale-105'
                        }`}
                        onClick={() => {
                          if (!isSpoilerHidden) setExpandedImage(block.mediaUrl);
                        }}
                      />
                      {isSpoilerHidden && (
                        <button
                          type="button"
                          onClick={() => setRevealedSpoilers((current) => new Set(current).add(block.messageId))}
                          className="absolute inset-0 grid place-items-center rounded-lg bg-black/30 text-sm font-semibold text-white"
                        >
                          Revelar spoiler
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {comment.text && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                    <FormattedText text={comment.text} onExternalLink={onExternalLink} />
                  </p>
                )}
                {comment.mediaUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {comment.mediaUrls.map((url, index) => (
                  <img
                    key={`${comment.id}-${index}`}
                    src={url}
                    alt="Imagen adjunta al comentario"
                    className="mt-2 max-h-60 max-w-full cursor-pointer rounded-lg object-cover transition-transform hover:scale-105"
                    onClick={() => setExpandedImage(url)}
                  />
                ))}
              </div>
                )}
              </>
            )}
            {!isEditing && canCollapseContent && (
              <div className="mt-3 border-t border-white/10 pt-2 text-center">
                <button
                  type="button"
                  aria-expanded={isContentExpanded}
                  onClick={() => setIsContentExpanded((expanded) => !expanded)}
                  className="w-full text-xs font-medium text-gray-300 transition-colors hover:text-white"
                >
                  {isContentExpanded ? 'Contraer comentario' : 'Expandir comentario'}
                </button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                aria-pressed={hasLiked}
                onClick={toggleLike}
                className={`text-xs font-medium transition-colors ${
                  hasLiked ? 'text-primary-light' : 'text-gray-400 hover:text-primary-light'
                }`}
              >
                <svg className="mr-1 inline h-3.5 w-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.3-8a2 2 0 0 0-2-2.3H14Z" />
                  <path d="M7 22H3V11h4" />
                </svg>
                Me gusta <span>{likes}</span>
              </button>
              <button
                type="button"
                aria-pressed={hasDisliked}
                onClick={toggleDislike}
                className={`text-xs font-medium transition-colors ${
                  hasDisliked ? 'text-primary-light' : 'text-gray-400 hover:text-primary-light'
                }`}
              >
                <svg className="mr-1 inline h-3.5 w-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 15v4a2 2 0 0 0 2 2l4-8V3H5.7a2 2 0 0 0-2 1.7l-1.3 8a2 2 0 0 0 2 2.3H10Z" />
                  <path d="M16 3h4v10h-4" />
                </svg>
                No me gusta <span>{dislikes}</span>
              </button>
              <button
                type="button"
                aria-expanded={isReplying}
                onClick={() => {
                  setIsReplying((current) => !current);
                  setReplyError('');
                }}
                className="text-xs font-medium text-gray-400 transition-colors hover:text-white"
              >
                Responder
              </button>
              {isCommentOwner(comment.userId, currentUserId) && !isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditError('');
                      setIsEditing(true);
                    }}
                    className="text-xs font-medium text-gray-400 transition-colors hover:text-white"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(comment.id)}
                    className="text-xs font-medium text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {isReplying && (
        <div className="ml-[2.5rem] mt-3 relative z-10">
          <RichCommentComposer
            error={replyError}
            isSubmitting={isSendingReply}
            submitLabel="Responder"
            variant="inline"
            contextLabel={`Respondiendo a ${comment.username}`}
            onSubmit={submitReply}
            onCancel={() => {
              setReplyError('');
              setIsReplying(false);
            }}
          />
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="relative z-30 ml-[2.5rem] mt-2">
          {isRepliesHidden ? (
            <div className="mb-2 mt-1">
              <button
                ref={replyButtonRef}
                type="button"
                aria-expanded={false}
                onClick={() => setIsRepliesHidden(false)}
                className="flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-[#3EA6FF] transition-colors hover:bg-[#3EA6FF]/10"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {comment.replies.length} respuestas
              </button>
            </div>
          ) : (
            <div className="mt-2">
              {comment.replies.map((reply) => (
                <div key={reply.id} className="relative">
                  <div
                    className={`absolute z-0 rounded-bl-[12px] border-b-2 border-l-2 transition-colors ${
                      isConnectorHovered ? 'border-white' : 'border-gray-700'
                    }`}
                    style={{ left: '-1.45rem', top: '-0.5rem', width: '1.2rem', height: '1.6rem' }}
                    aria-hidden="true"
                  />
                  <CommentItem
                    comment={reply}
                    onSubmitReply={onSubmitReply}
                    onEdit={onEdit}
                    onRequestDelete={onRequestDelete}
                    onExternalLink={onExternalLink}
                    currentUserId={currentUserId}
                    isNested={true}
                  />
                </div>
              ))}
              <div className="mb-3 mt-2">
                <button
                  type="button"
                  aria-expanded={true}
                  onClick={() => setIsRepliesHidden(true)}
                  className="flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-[#3EA6FF] transition-colors hover:bg-[#3EA6FF]/10"
                >
                  <svg className="mr-2 h-4 w-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  Ocultar respuestas
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black bg-opacity-80 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            className="max-h-full max-w-full rounded-md object-contain"
            alt="Ampliada"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4 17 5-5 3 3 2-2 6 5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function SpoilerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 20 16-16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ComposerToolbar({
  onFormat,
  onSelectFiles,
  multiple = true,
}: {
  onFormat: (prefix: string, suffix: string) => void;
  onSelectFiles: (files: File[]) => void;
  multiple?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-1 text-gray-400">
      <button
        type="button"
        aria-label="Negrita"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat('**', '**')}
        className="grid h-8 w-8 place-items-center rounded-md text-sm hover:bg-white/10 hover:text-white"
      >
        <FormatIcon kind="bold" />
      </button>
      <button
        type="button"
        aria-label="Cursiva"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat('__', '__')}
        className="grid h-8 w-8 place-items-center rounded-md text-sm hover:bg-white/10 hover:text-white"
      >
        <FormatIcon kind="italic" />
      </button>
      <button type="button" aria-label="Formato emoji" className="grid h-8 w-8 place-items-center rounded-md text-sm hover:bg-white/10 hover:text-white">
        <FormatIcon kind="emoji" />
      </button>
      <button
        type="button"
        aria-label="Insertar spoiler"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat('||', '||')}
        className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10 hover:text-white"
      >
        <SpoilerIcon />
      </button>
      <button
        type="button"
        aria-label="Adjuntar imagen"
        onClick={() => fileInputRef.current?.click()}
        className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10 hover:text-white"
      >
        <ImageIcon />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        aria-label="Seleccionar imágenes"
        onChange={(event) => {
          onSelectFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}

function RichCommentComposer({
  initialBlocks,
  error,
  isSubmitting,
  submitLabel,
  onSubmit,
  onCancel,
  variant = 'default',
  contextLabel,
}: {
  initialBlocks?: TelegramCommentDraftBlock[];
  error: string;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (blocks: TelegramCommentDraftBlock[]) => Promise<void>;
  onCancel?: () => void;
  variant?: 'default' | 'inline';
  contextLabel?: string;
}) {
  const [blocks, setBlocks] = useState<TelegramCommentDraftBlock[]>(() =>
    normalizeDraftBlocks(initialBlocks?.length
      ? initialBlocks.map((block) => ({ ...block }))
      : [{ kind: 'text', text: '' }]),
  );
  const [activeTextBlock, setActiveTextBlock] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const textareaRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const objectUrls = useRef(new Set<string>());

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateText = (index: number, text: string) => {
    setBlocks((current) => current.map((block, blockIndex) =>
      blockIndex === index && block.kind === 'text' ? { ...block, text } : block,
    ));
  };

  const formatText = (prefix: string, suffix: string) => {
    const textarea = textareaRefs.current.get(activeTextBlock);
    const block = blocks[activeTextBlock];
    if (!textarea || !block || block.kind !== 'text') return;
    const start = selection.start;
    const end = selection.end;
    const selectedText = block.text.slice(start, end);
    updateText(
      activeTextBlock,
      `${block.text.slice(0, start)}${prefix}${selectedText}${suffix}${block.text.slice(end)}`,
    );
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    });
  };

  const insertImages = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const activeBlock = blocks[activeTextBlock];
    if (!activeBlock || activeBlock.kind !== 'text') return;
    const start = selection.start;
    const end = selection.end;
    const beforeText = activeBlock.text.slice(0, start);
    const afterText = activeBlock.text.slice(end);
    const newBlocks: TelegramCommentDraftBlock[] = [];
    if (beforeText) {
      newBlocks.push({ ...activeBlock, text: beforeText });
    }
    imageFiles.forEach((file) => {
      const mediaUrl = URL.createObjectURL(file);
      objectUrls.current.add(mediaUrl);
      newBlocks.push({ kind: 'image', file, mediaUrl, isSpoiler: false });
    });
    if (afterText) {
      newBlocks.push({
        ...activeBlock,
        text: afterText,
        messageId: beforeText ? undefined : activeBlock.messageId,
      });
    }
    const nextBlocks = normalizeDraftBlocks([
      ...blocks.slice(0, activeTextBlock),
      ...newBlocks,
      ...blocks.slice(activeTextBlock + 1),
    ]);
    setBlocks(nextBlocks);
    const nextIndex = nextBlocks.length - 1;
    const caretPosition = 0;
    setActiveTextBlock(nextIndex);
    setSelection({ start: caretPosition, end: caretPosition });
    requestAnimationFrame(() => {
      const nextTextarea = textareaRefs.current.get(nextIndex);
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(caretPosition, caretPosition);
    });
  };

  const removeBlock = (index: number) => {
    const removed = blocks[index];
    if (removed?.kind === 'image' && removed.file && removed.mediaUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.mediaUrl);
      objectUrls.current.delete(removed.mediaUrl);
    }
    const nextBlocks = normalizeDraftBlocks(blocks.filter((_, blockIndex) => blockIndex !== index));
    const nextTextIndex = nextBlocks.findIndex((block, blockIndex) =>
      block.kind === 'text' && blockIndex >= index,
    );
    const targetIndex = nextTextIndex >= 0 ? nextTextIndex : nextBlocks.length - 1;
    setBlocks(nextBlocks);
    setActiveTextBlock(targetIndex);
    setSelection({ start: 0, end: 0 });
    requestAnimationFrame(() => {
      const textarea = textareaRefs.current.get(targetIndex);
      textarea?.focus();
      textarea?.setSelectionRange(0, 0);
    });
  };

  const toggleSpoiler = (index: number) => {
    setBlocks((current) => current.map((block, blockIndex) =>
      blockIndex === index && block.kind === 'image' ? { ...block, isSpoiler: !block.isSpoiler } : block,
    ));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = blocks.filter((block) => block.kind === 'image' || block.text.trim());
    if (content.length === 0 || isSubmitting) return;
    try {
      await onSubmit(content);
      blocks.forEach((block) => {
        if (block.kind === 'image' && block.file && block.mediaUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(block.mediaUrl);
          objectUrls.current.delete(block.mediaUrl);
        }
      });
      setBlocks([{ kind: 'text', text: '' }]);
      setActiveTextBlock(0);
      setSelection({ start: 0, end: 0 });
    } catch {
      return;
    }
  };

  const hasContent = blocks.some((block) => block.kind === 'image' || block.text.trim());

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={variant === 'inline'
        ? 'space-y-3 rounded-xl border border-white/10 bg-[#1a1c23] p-3 shadow-lg shadow-black/10 sm:p-4'
        : 'space-y-3'}
    >
      {contextLabel && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`grid h-7 w-7 place-items-center rounded-full ${
            variant === 'inline' ? 'bg-primary/15 text-primary-light' : 'bg-white/5 text-gray-400'
          }`}>
            {variant === 'inline' ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {contextLabel === 'Editando comentario' ? (
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                ) : (
                  <path d="M10 8 6 12l4 4M6 12h12a3 3 0 0 1 3 3v1" />
                )}
              </svg>
            ) : null}
          </span>
          <span className="font-medium text-gray-300">{contextLabel}</span>
        </div>
      )}
      <div className="rounded-lg border border-white/10 bg-[#0d0e14] p-3">
        <div className="flex flex-wrap items-start gap-3">
          {blocks.map((block, index) => block.kind === 'text' ? (
            <textarea
              key={`text-${index}`}
              ref={(element) => {
                if (element) textareaRefs.current.set(index, element);
                else textareaRefs.current.delete(index);
              }}
              aria-label="Texto del comentario"
              value={block.text}
              onFocus={() => setActiveTextBlock(index)}
              onSelect={(event) => {
                setActiveTextBlock(index);
                setSelection({
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                });
              }}
              onClick={(event) => setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })}
              onKeyUp={(event) => setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })}
              onChange={(event) => updateText(index, event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={Math.max(2, Math.min(8, block.text.split('\n').length + 1))}
              placeholder="Escribe algo..."
              className="min-h-[4.5rem] w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 text-white outline-none placeholder:text-gray-500 focus:ring-0"
            />
          ) : (
            <div key={`image-${index}`} className="relative h-40 w-40 shrink-0 overflow-hidden rounded-lg">
              {block.mediaUrl && (
                <img
                  src={block.mediaUrl}
                  alt={block.file ? `Vista previa: ${block.file.name}` : 'Imagen del comentario'}
                  className={`h-full w-full object-contain ${block.isSpoiler ? 'blur-xl' : ''}`}
                />
              )}
              <button
                type="button"
                aria-pressed={block.isSpoiler}
                onClick={() => toggleSpoiler(index)}
                className="absolute bottom-2 left-2 rounded-lg bg-black/75 px-3 py-2 text-xs font-medium text-white shadow"
              >
                {block.isSpoiler ? 'Imagen marcada como spoiler' : 'Marcar como spoiler'}
              </button>
              <button
                type="button"
                aria-label="Quitar imagen"
                onClick={() => removeBlock(index)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-white hover:bg-black"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 ${
        variant === 'inline' ? 'sm:pt-3' : ''
      }`}>
        <ComposerToolbar
          onFormat={formatText}
          onSelectFiles={insertImages}
        />
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!hasContent || isSubmitting}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

type CommentSectionProps = {
  animeId: string | number;
  episodeId?: string | number | null;
  title: string;
};

type CreateThreadPayload = {
  animeId: string | number;
  episodeId: string | number | null;
  title: string;
};

const createThreadRequests = new Map<string, { promise: Promise<void>; createdAt: number }>();

function createThreadOnce(hashtag: string, payload: CreateThreadPayload) {
  const now = Date.now();
  for (const [key, request] of createThreadRequests) {
    if (now - request.createdAt > 30_000) createThreadRequests.delete(key);
  }

  const existingRequest = createThreadRequests.get(hashtag);
  if (existingRequest) return existingRequest.promise;

  const promise = (async () => {
    const response = await fetch('/api/create-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const message = typeof result === 'object' && result !== null &&
        'error' in result && typeof result.error === 'string'
        ? result.error
        : 'No se pudo crear el hilo de comentarios.';
      throw new Error(message);
    }
  })();

  createThreadRequests.set(hashtag, { promise, createdAt: now });
  void promise.catch(() => {
    if (createThreadRequests.get(hashtag)?.promise === promise) {
      createThreadRequests.delete(hashtag);
    }
  });
  return promise;
}

export default function CommentSection({ animeId, episodeId = null, title }: CommentSectionProps) {
  const {
    client,
    isAuthenticated,
    currentUserId,
    isLoading: isTelegramLoading,
    sendComment,
    editComment,
    deleteCommentMessages,
    fetchComments,
    findCommentThread,
  } = useTelegram();
  const [comments, setComments] = useState<Comment[]>([]);
  const [externalLinkWarning, setExternalLinkWarning] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [deleteCommentError, setDeleteCommentError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextOffsetId, setNextOffsetId] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sortBy, setSortBy] = useState<CommentSortOption>('recientes');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const commentMediaUrlsRef = useRef(new Set<string>());

  const sortedComments = [...comments].sort((first, second) => {
    if (sortBy === 'populares') return second.likes - first.likes;
    if (sortBy === 'respuestas') return second.replies.length - first.replies.length;

    const getTimestamp = (comment: Comment) =>
      comment.timestamp ?? (Date.parse(comment.time) || Number(comment.id) || 0);
    const dateDifference = getTimestamp(second) - getTimestamp(first);
    return sortBy === 'recientes' ? dateDifference : -dateDifference;
  });

  useEffect(() => {
    if (!isDropdownOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !sortDropdownRef.current?.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDropdownOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isLoadingComments || !window.location.hash.startsWith('#comment-')) return;
    const commentId = decodeURIComponent(window.location.hash.slice('#comment-'.length));
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`comment-${commentId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [comments, isLoadingComments]);

  useEffect(() => {
    const currentUrls = new Set<string>();
    const collectMediaUrls = (items: Comment[]) => items.forEach((comment) => {
      comment.mediaUrls.forEach((url) => currentUrls.add(url));
      collectMediaUrls(comment.replies);
    });
    collectMediaUrls(comments);

    commentMediaUrlsRef.current.forEach((url) => {
      if (!currentUrls.has(url)) URL.revokeObjectURL(url);
    });
    commentMediaUrlsRef.current = currentUrls;
  }, [comments]);

  useEffect(() => () => {
    commentMediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const initThread = useCallback(async (isCancelled: () => boolean) => {
    if (isTelegramLoading || !title || title === 'Anime' || title.trim() === '') return;
    setIsLoadingComments(true);
    setIsCreatingThread(false);
    setCommentsError('');
    setCurrentThreadId(null);
    setComments([]);
    setHasMore(false);
    setNextOffsetId(null);

    try {
      if (!client || !isAuthenticated) {
        throw new Error('Conecta una sesión autenticada de Telegram para ver los comentarios.');
      }

      const hashtag = buildCommentThreadHashtag(animeId, episodeId);
      let threadId = await findCommentThread(hashtag);
      if (isCancelled()) return;

      if (threadId !== null) {
        setCurrentThreadId(threadId);
        const cacheKey = `comments_${threadId}`;
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed: unknown = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.every(isCachedComment)) {
              setComments(withoutCachedMediaUrls(parsed));
            }
          }
        } catch (error) {
          console.error('No se pudo leer la caché de comentarios.', error);
        }
        const page = await fetchComments(threadId);
        if (!isCancelled()) {
          setComments(page.comments);
          setHasMore(page.hasMore);
          setNextOffsetId(page.nextOffsetId);
        }
        return;
      }

      setIsCreatingThread(true);
      await createThreadOnce(hashtag, { animeId, episodeId, title });
      if (isCancelled()) return;
      for (let attempt = 0; attempt < 5 && threadId === null; attempt += 1) {
        threadId = await findCommentThread(hashtag);
        if (threadId === null && attempt < 4) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          if (isCancelled()) return;
        }
      }
      if (threadId === null) {
        throw new Error('Telegram aún no muestra el hilo creado. Inténtalo de nuevo en unos segundos.');
      }

      if (isCancelled()) return;
      setCurrentThreadId(threadId);
      const cacheKey = `comments_${threadId}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: unknown = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.every(isCachedComment)) {
            setComments(withoutCachedMediaUrls(parsed));
          }
        }
      } catch (error) {
        console.error('No se pudo leer la caché de comentarios.', error);
      }
      const page = await fetchComments(threadId);
      if (!isCancelled()) {
        setComments(page.comments);
        setHasMore(page.hasMore);
        setNextOffsetId(page.nextOffsetId);
      }
    } catch (error) {
      if (!isCancelled()) {
        setCommentsError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!isCancelled()) {
        setIsCreatingThread(false);
        setIsLoadingComments(false);
      }
    }
  }, [
    animeId,
    client,
    episodeId,
    fetchComments,
    findCommentThread,
    isAuthenticated,
    isTelegramLoading,
    title,
  ]);

  const handleEditComment = async (comment: Comment, blocks: TelegramCommentDraftBlock[]) => {
    if (currentThreadId === null) throw new Error('El hilo de comentarios no está disponible.');
    const replyToMessageId = comment.replyToMessageId ? Number(comment.replyToMessageId) : undefined;
    await editComment(
      Number(comment.id),
      blocks,
      comment.messageIds ?? [comment.id],
      (comment.contentBlocks
        ? comment.contentBlocks
        .filter((block): block is Extract<TelegramCommentContentBlock, { kind: 'image' }> => block.kind === 'image')
        .map((block) => block.messageId)
        : comment.mediaUrls.length > 0 ? comment.messageIds ?? [comment.id] : []),
      currentThreadId,
      replyToMessageId,
      comment.contentGroupId,
    );
    try {
      const refreshedComments = await fetchComments(currentThreadId);
      setComments(refreshedComments.comments);
      setHasMore(refreshedComments.hasMore);
      setNextOffsetId(refreshedComments.nextOffsetId);
    } catch (refreshError) {
      setCommentsError(
        `El comentario se guardó, pero no se pudo actualizar la lista: ${
          refreshError instanceof Error ? refreshError.message : String(refreshError)
        }`,
      );
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (currentThreadId === null) throw new Error('El hilo de comentarios no está disponible.');
    const messageIds = collectCommentMessageIds(comments, commentId);
    if (!messageIds) throw new Error('No se encontró el comentario que deseas eliminar.');

    const numericMessageIds = messageIds.map(Number);
    if (numericMessageIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('No se pudieron validar los identificadores de los mensajes que se eliminarán.');
    }

    await deleteCommentMessages(numericMessageIds);
    const deletedCommentIds = new Set(messageIds);
    setComments((current) => {
      const updated = removeCommentsByIds(current, deletedCommentIds);
      try {
        localStorage.setItem(
          `comments_${currentThreadId}`,
          JSON.stringify(withoutCachedMediaUrls(updated)),
        );
      } catch (error) {
        console.error('No se pudo actualizar la caché tras eliminar el comentario.', error);
      }
      return updated;
    });
  };

  const confirmDeleteComment = async () => {
    if (commentToDelete === null || isDeletingComment) return;
    setIsDeletingComment(true);
    setDeleteCommentError('');
    try {
      await handleDeleteComment(String(commentToDelete));
      setCommentToDelete(null);
    } catch (error) {
      setDeleteCommentError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeletingComment(false);
    }
  };

  const handleSubmitReply = async (
    blocks: TelegramCommentDraftBlock[],
    replyToMessageId: string,
  ) => {
    if (currentThreadId === null) throw new Error('El hilo de comentarios no está disponible.');
    const messageId = Number(replyToMessageId);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      throw new Error('No se pudo determinar el comentario al que estás respondiendo.');
    }

    await sendComment(blocks, currentThreadId, messageId);
    try {
      const refreshedComments = await fetchComments(currentThreadId);
      setComments(refreshedComments.comments);
      setHasMore(refreshedComments.hasMore);
      setNextOffsetId(refreshedComments.nextOffsetId);
    } catch (refreshError) {
      setCommentsError(
        `La respuesta se envió, pero no se pudo actualizar la lista: ${
          refreshError instanceof Error ? refreshError.message : String(refreshError)
        }`,
      );
    }
  };

  const loadMoreComments = async () => {
    if (currentThreadId === null || nextOffsetId === null || isLoadingMore) return;
    setIsLoadingMore(true);
    setCommentsError('');
    try {
      const page = await fetchComments(currentThreadId, nextOffsetId);
      setComments((current) => {
        const combined = mergeCommentsByAlbum(current, page.comments);
        try {
          localStorage.setItem(
            `comments_${currentThreadId}`,
            JSON.stringify(withoutCachedMediaUrls(combined)),
          );
        } catch (error) {
          console.error('No se pudo actualizar la caché de comentarios.', error);
        }
        return combined;
      });
      setHasMore(page.hasMore);
      setNextOffsetId(page.nextOffsetId);
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!title || title === 'Anime' || title.trim() === '') return;
    void initThread(() => cancelled);
    return () => {
      cancelled = true;
      setCurrentThreadId(null);
      setComments([]);
    };
  }, [initThread]);

  const submitComment = async (blocks: TelegramCommentDraftBlock[]) => {
    if (currentThreadId === null) {
      const error = new Error('El hilo de comentarios todavía no está disponible.');
      setSubmitError(error.message);
      throw error;
    }
    setIsSending(true);
    setSubmitError('');
    try {
      await sendComment(blocks, currentThreadId);
      try {
        const refreshedComments = await fetchComments(currentThreadId);
        setComments(refreshedComments.comments);
        setHasMore(refreshedComments.hasMore);
        setNextOffsetId(refreshedComments.nextOffsetId);
      } catch (refreshError) {
        setSubmitError(
          `El comentario se envió, pero no se pudo actualizar la lista: ${
            refreshError instanceof Error ? refreshError.message : String(refreshError)
          }`,
        );
      }
    } catch (sendError) {
      setSubmitError(sendError instanceof Error ? sendError.message : String(sendError));
      throw sendError;
    } finally {
      setIsSending(false);
    }
  };

  const isInitializing = isLoadingComments || isCreatingThread;

  return (
    <section aria-labelledby="comments-heading" className="mt-12">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">Comunidad</p>
          <h2 id="comments-heading" className="mt-1 text-2xl font-bold text-white">Comentarios</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-gray-400">{countComments(comments)}</span>
          <div ref={sortDropdownRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              onClick={() => setIsDropdownOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1c23] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/20 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              <span>Ordenar por: <span className="text-white">{commentSortLabels[sortBy]}</span></span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            {isDropdownOpen && (
              <div
                role="menu"
                aria-label="Ordenar comentarios"
                className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#282828] p-1.5 shadow-xl shadow-black/30"
              >
                {(Object.keys(commentSortLabels) as CommentSortOption[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortBy === option}
                    onClick={() => {
                      setSortBy(option);
                      setIsDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#3f3f3f] ${
                      sortBy === option ? 'text-white' : 'text-gray-300'
                    }`}
                  >
                    {commentSortLabels[option]}
                    {sortBy === option && <span aria-hidden="true" className="text-primary-light">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1a1c23] p-4 sm:p-5">
        {isCreatingThread && (
          <p role="status" className="mb-3 animate-pulse text-sm text-purple-400">
            Creando espacio de discusión...
          </p>
        )}
        <RichCommentComposer
          key={currentThreadId ?? 'pending-thread'}
          error={submitError}
          isSubmitting={isInitializing || isSending}
          submitLabel="Comentar"
          onSubmit={submitComment}
        />
      </div>

      {comments.length > 0 ? (
        <div className="mt-5 space-y-5">
          {isLoadingComments && (
            <p role="status" className="text-center text-xs text-gray-500">Actualizando comentarios...</p>
          )}
          {commentsError && (
            <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              No se pudieron actualizar los comentarios: {commentsError}
            </p>
          )}
          {sortedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSubmitReply={handleSubmitReply}
              onEdit={handleEditComment}
              onRequestDelete={(commentId) => {
                setDeleteCommentError('');
                setCommentToDelete(commentId);
              }}
              onExternalLink={setExternalLinkWarning}
              currentUserId={currentUserId}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMoreComments()}
              disabled={isLoadingMore}
              className="mx-auto block rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMore ? 'Cargando...' : 'Cargar más comentarios...'}
            </button>
          )}
        </div>
      ) : isLoadingComments ? (
        !isCreatingThread && (
          <p role="status" className="mt-5 py-6 text-center text-sm text-gray-400">Cargando comentarios...</p>
        )
      ) : commentsError ? (
        <p role="alert" className="mt-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          No se pudieron cargar los comentarios: {commentsError}
        </p>
      ) : (
        <p className="mt-5 animate-pulse rounded-xl border border-white/10 bg-[#1a1c23] px-5 py-8 text-center text-sm text-gray-400">
          ¡Sé el primero en decir lo que piensas!
        </p>
      )}
      {externalLinkWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4"
          onClick={() => {
            setExternalLinkWarning(null);
            setDontAskAgain(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-link-warning-title"
            className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="external-link-warning-title" className="mb-3 text-xl font-bold text-white">
              Advertencia de Enlace Externo
            </h3>
            <p className="mb-6 text-sm text-gray-300">
              Estás a punto de salir de AnimeKT. No nos hacemos responsables del contenido de páginas de terceros.
            </p>
            <label className="mb-6 flex cursor-pointer items-center justify-center text-sm text-gray-400">
              <input
                type="checkbox"
                className="mr-2 cursor-pointer rounded border-gray-600 bg-gray-800 text-purple-600 accent-purple-600"
                checked={dontAskAgain}
                onChange={(event) => setDontAskAgain(event.target.checked)}
              />
              No volver a preguntar en este navegador
            </label>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                className="rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                onClick={() => {
                  setExternalLinkWarning(null);
                  setDontAskAgain(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-500"
                onClick={() => {
                  if (dontAskAgain) {
                    try {
                      localStorage.setItem('skipLinkWarning', 'true');
                    } catch (error) {
                      console.error('No se pudo guardar la preferencia de enlaces externos.', error);
                    }
                  }
                  window.open(externalLinkWarning, '_blank', 'noopener,noreferrer');
                  setExternalLinkWarning(null);
                  setDontAskAgain(false);
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      {commentToDelete !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4"
          onClick={() => {
            if (!isDeletingComment) setCommentToDelete(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-comment-title"
            className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-comment-title" className="mb-2 text-xl font-bold text-white">
              Eliminar comentario
            </h3>
            <p className="mb-6 text-sm text-gray-400">
              ¿Seguro que deseas eliminar tu comentario definitivamente? Esta acción no se puede deshacer.
            </p>
            {deleteCommentError && (
              <p role="alert" className="mb-4 text-sm text-red-300">{deleteCommentError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingComment}
                className="rounded-lg px-5 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
                onClick={() => setCommentToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingComment}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                onClick={() => void confirmDeleteComment()}
              >
                {isDeletingComment ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
