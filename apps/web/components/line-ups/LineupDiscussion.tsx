"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/Avatar"
import { Button } from "@workspace/ui/components/Button"
import { CardContent } from "@workspace/ui/components/Card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/Collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/Popover"
import { Separator } from "@workspace/ui/components/Separator"
import { Skeleton } from "@workspace/ui/components/Skeleton"
import { toast } from "@workspace/ui/components/Sonner"
import { Textarea } from "@workspace/ui/components/Textarea"
import { cn } from "@workspace/ui/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { MoreHorizontal, Reply, SmilePlus } from "lucide-react"
import { FunctionComponent, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useSession } from "@/components/SessionProvider"
import type { operations } from "@/types/api"

// Mirrors the API's curated `reactionEmoji` pg enum (see app-schema.ts) -
// kept in sync by hand since there's no dedicated "list available reactions"
// endpoint to source it from.
const REACTION_EMOJIS = ["🙏", "❤️", "🔥", "👏", "😂"] as const

type LineupComment = operations["listLineupComments"]["responses"][200]["content"]["application/json"][number]
type LineupCommentReply = LineupComment["replies"][number]
type ReactionEmoji = LineupCommentReply["reactions"][number]["emoji"]

interface ReactionPickerProps {
  disabled?: boolean
  onReact: (emoji: ReactionEmoji) => void
}

// Trigger that opens the curated emoji picker for a fresh reaction - styled
// as plain muted text (not a bordered button) so it reads as one of several
// lightweight actions under a comment, matching Reply's own styling rather
// than standing out as its own control.
const ReactionPicker: FunctionComponent<ReactionPickerProps> = ({ disabled, onReact }) => (
  <Popover>
    <PopoverTrigger
      render={
        <button
          type="button"
          disabled={disabled}
          aria-label="Add reaction"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        />
      }
    >
      <SmilePlus className="size-4" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={disabled}
          onClick={() => onReact(emoji)}
          className="rounded-md p-1 text-base transition-colors hover:bg-accent"
        >
          {emoji}
        </button>
      ))}
    </PopoverContent>
  </Popover>
)

interface CommentBubbleProps {
  comment: LineupCommentReply
  reactionPending?: boolean
  onReact: (emoji: ReactionEmoji) => void
  /** Only top-level comments can be replied to - see the API's one-level-of-nesting rule. */
  onReply?: () => void
  /** Whether the requesting user is this comment's own author - gates the "..." edit/delete menu. */
  isOwn: boolean
  isEditing: boolean
  editBody: string
  onEditBodyChange: (value: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  editSubmitting?: boolean
  onDelete: () => void
  deleteSubmitting?: boolean
}

// One comment or reply's avatar, author/body text, and its action row -
// shared by top-level comments and replies alike (see CommentThread), since
// they're visually identical apart from indentation and whether replying is
// offered. Deliberately no bubble/background - just spacing and typography,
// so a dense thread doesn't turn into a wall of boxes.
const CommentBubble: FunctionComponent<CommentBubbleProps> = ({
  comment,
  reactionPending,
  onReact,
  onReply,
  isOwn,
  isEditing,
  editBody,
  onEditBodyChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  editSubmitting,
  onDelete,
  deleteSubmitting,
}) => (
  <div className="flex gap-2.5">
    <Avatar size="sm" className="mt-0.5">
      <AvatarImage src={comment.author.image ?? undefined} alt={comment.author.name} />
      <AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium">{comment.author.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
        </span>
        {isOwn && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Comment actions"
                  className="ml-auto size-5 rounded-full"
                />
              }
            >
              <MoreHorizontal className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onStartEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={deleteSubmitting} onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isEditing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <Textarea
            value={editBody}
            onChange={(e) => onEditBodyChange(e.target.value)}
            disabled={editSubmitting}
            className="min-h-9 resize-none border-none bg-muted/50 text-sm shadow-none focus-visible:ring-1"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={editSubmitting} onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={editSubmitting || editBody.trim().length === 0}
              onClick={onSaveEdit}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-sm whitespace-pre-line text-foreground/90">{comment.body}</p>
      )}

      {!isEditing && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {comment.reactions.some((reaction) => reaction.count > 0) && (
            <div className="flex items-center gap-1">
              {comment.reactions
                .filter((reaction) => reaction.count > 0)
                .map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    disabled={reactionPending}
                    onClick={() => onReact(reaction.emoji)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors",
                      reaction.reactedByMe
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    <span>{reaction.emoji}</span>
                    <span>{reaction.count}</span>
                  </button>
                ))}
            </div>
          )}
          <ReactionPicker disabled={reactionPending} onReact={onReact} />
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Reply className="size-3" />
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  </div>
)

interface CommentComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  submitting?: boolean
  onCancel?: () => void
  authorImage?: string
  authorName?: string
}

// Shared by the "new top-level comment" composer and each comment's inline
// reply composer - just an avatar (the requesting user's own, from
// useSession) next to a borderless Textarea, so it reads as part of the
// thread rather than a boxed form bolted onto it. The submit row only
// appears once there's something to submit (or to cancel out of), keeping
// an idle composer down to a single quiet line.
const CommentComposer: FunctionComponent<CommentComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitting,
  onCancel,
  authorImage,
  authorName,
}) => (
  <div className="flex gap-2.5">
    <Avatar className="mt-0.5">
      <AvatarImage src={authorImage} alt={authorName ?? "You"} />
      <AvatarFallback>{authorName ? authorName.charAt(0) : "?"}</AvatarFallback>
    </Avatar>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={submitting}
        className="min-h-9 resize-none border-none bg-muted/50 text-sm shadow-none focus-visible:ring-1"
      />
      {(value.trim().length > 0 || onCancel) && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={submitting || value.trim().length === 0}
            onClick={onSubmit}
          >
            Post
          </Button>
        </div>
      )}
    </div>
  </div>
)

interface CommentThreadProps {
  comment: LineupComment
  reactionPendingId: string | null
  onReact: (commentId: string, emoji: ReactionEmoji) => void
  replyingToId: string | null
  onStartReply: () => void
  replyBody: string
  onReplyBodyChange: (value: string) => void
  onSubmitReply: () => void
  onCancelReply: () => void
  replySubmitting?: boolean
  authorImage?: string
  authorName?: string
  /** Only the requesting user's own comments/replies get the "..." edit/delete menu. */
  currentUserId?: string
  editingCommentId: string | null
  editBody: string
  onEditBodyChange: (value: string) => void
  onStartEdit: (commentId: string) => void
  onSaveEdit: (commentId: string) => void
  onCancelEdit: () => void
  editSubmitting?: boolean
  onDelete: (commentId: string) => void
  deletingCommentId: string | null
}

// A top-level comment, its reaction row, and (one level only, per the API)
// its replies - plus the inline reply composer when this is the comment
// currently being replied to. See CommentComposer for why replies share the
// composer with the top-level "new comment" field rather than each having
// their own component.
const CommentThread: FunctionComponent<CommentThreadProps> = ({
  comment,
  reactionPendingId,
  onReact,
  replyingToId,
  onStartReply,
  replyBody,
  onReplyBodyChange,
  onSubmitReply,
  onCancelReply,
  replySubmitting,
  authorImage,
  authorName,
  currentUserId,
  editingCommentId,
  editBody,
  onEditBodyChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  editSubmitting,
  onDelete,
  deletingCommentId,
}) => (
  <div className="flex flex-col gap-3">
    <CommentBubble
      comment={comment}
      reactionPending={reactionPendingId === comment.id}
      onReact={(emoji) => onReact(comment.id, emoji)}
      onReply={onStartReply}
      isOwn={currentUserId != null && comment.author.id === currentUserId}
      isEditing={editingCommentId === comment.id}
      editBody={editBody}
      onEditBodyChange={onEditBodyChange}
      onStartEdit={() => onStartEdit(comment.id)}
      onSaveEdit={() => onSaveEdit(comment.id)}
      onCancelEdit={onCancelEdit}
      editSubmitting={editSubmitting && editingCommentId === comment.id}
      onDelete={() => onDelete(comment.id)}
      deleteSubmitting={deletingCommentId === comment.id}
    />
    {comment.replies.length > 0 && (
      <div className="ml-9 flex flex-col gap-3 border-l border-border pl-3">
        {comment.replies.map((reply) => (
          <CommentBubble
            key={reply.id}
            comment={reply}
            reactionPending={reactionPendingId === reply.id}
            onReact={(emoji) => onReact(reply.id, emoji)}
            isOwn={currentUserId != null && reply.author.id === currentUserId}
            isEditing={editingCommentId === reply.id}
            editBody={editBody}
            onEditBodyChange={onEditBodyChange}
            onStartEdit={() => onStartEdit(reply.id)}
            onSaveEdit={() => onSaveEdit(reply.id)}
            onCancelEdit={onCancelEdit}
            editSubmitting={editSubmitting && editingCommentId === reply.id}
            onDelete={() => onDelete(reply.id)}
            deleteSubmitting={deletingCommentId === reply.id}
          />
        ))}
      </div>
    )}
    {replyingToId === comment.id && (
      <div className="ml-9">
        <CommentComposer
          value={replyBody}
          onChange={onReplyBodyChange}
          onSubmit={onSubmitReply}
          onCancel={onCancelReply}
          placeholder={`Reply to ${comment.author.name}...`}
          submitting={replySubmitting}
          authorImage={authorImage}
          authorName={authorName}
        />
      </div>
    )}
  </div>
)

interface LineupDiscussionProps {
  lineupId: string
}

// The lineup card's discussion section - a collapsible comment thread with
// replies (one level), emoji reactions, and edit/delete on your own
// comments. Fully self-contained: given just the lineup's id, it fetches
// its own comments, resolves the requesting user via useSession, and owns
// every mutation, so LineupDetailsView only has to assemble it in as the
// second CardContent section of the shared Card (see LineupSongList for the
// first). Renders its own leading Separator, since that boundary is this
// section's concern, not the assembler's.
export const LineupDiscussion: FunctionComponent<LineupDiscussionProps> = ({ lineupId }) => {
  const queryClient = useQueryClient()
  const session = useSession()
  const currentUserId = session?.user.id as string | undefined
  const currentUserImage = session?.user.image as string | undefined
  const currentUserName = session?.user.name as string | undefined

  const commentsQuery = useQuery({
    queryKey: ["lineup-comments", lineupId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/lineups/{id}/comments", {
        params: { path: { id: lineupId } },
      })
      if (error) throw new Error("Failed to load comments.")
      return data
    },
  })

  const invalidateComments = () => queryClient.invalidateQueries({ queryKey: ["lineup-comments", lineupId] })
  const onMutationError = (error: Error) => toast.error(error.message, { position: "top-center" })

  const [discussionOpen, setDiscussionOpen] = useState(true)
  const [newCommentBody, setNewCommentBody] = useState("")
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")

  const postComment = useMutation({
    mutationFn: async ({ body, parentCommentId }: { body: string; parentCommentId?: string }) => {
      const { error } = await apiClient.POST("/api/lineups/{id}/comments", {
        params: { path: { id: lineupId } },
        body: { body, parentCommentId },
      })
      if (error) throw new Error("Failed to post comment.")
    },
    onSuccess: invalidateComments,
    onError: onMutationError,
  })

  const [reactingToId, setReactingToId] = useState<string | null>(null)

  const toggleReaction = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: string; emoji: ReactionEmoji }) => {
      setReactingToId(commentId)
      const { error } = await apiClient.POST("/api/lineups/{id}/comments/{commentId}/reactions", {
        params: { path: { id: lineupId, commentId } },
        body: { emoji },
      })
      if (error) throw new Error("Failed to react.")
    },
    onSuccess: invalidateComments,
    onError: onMutationError,
    onSettled: () => setReactingToId(null),
  })

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")

  const updateComment = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      const { error } = await apiClient.PATCH("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: lineupId, commentId } },
        body: { body },
      })
      if (error) throw new Error("Failed to update comment.")
    },
    onSuccess: () => {
      invalidateComments()
      setEditingCommentId(null)
      setEditBody("")
    },
    onError: onMutationError,
  })

  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      setDeletingCommentId(commentId)
      const { error } = await apiClient.DELETE("/api/lineups/{id}/comments/{commentId}", {
        params: { path: { id: lineupId, commentId } },
      })
      if (error) throw new Error("Failed to delete comment.")
    },
    onSuccess: invalidateComments,
    onError: onMutationError,
    onSettled: () => setDeletingCommentId(null),
  })

  const startEditingComment = (commentId: string) => {
    // Only ever called from an Edit menu item rendered off an already-loaded
    // comment/reply, so `commentsQuery.data` can't be undefined and `target`
    // can't go unfound here - the fallbacks below just satisfy the type
    // checker (see noUncheckedIndexedAccess in typescript-config).
    /* v8 ignore next */
    const target = (commentsQuery.data ?? [])
      .flatMap((comment) => [comment, ...comment.replies])
      .find((comment) => comment.id === commentId)
    setEditingCommentId(commentId)
    /* v8 ignore next */
    setEditBody(target?.body ?? "")
  }

  const cancelEditingComment = () => {
    setEditingCommentId(null)
    setEditBody("")
  }

  // Only read once isLoading/isError are both false below, at which point a
  // query can't actually have undefined data - the fallback just satisfies
  // the type checker (see noUncheckedIndexedAccess in typescript-config).
  /* v8 ignore next */
  const comments = commentsQuery.data ?? []

  return (
    <>
      <Separator />

      <CardContent>
        <Collapsible
          open={discussionOpen}
          onOpenChange={setDiscussionOpen}
          className="group/discussion flex flex-col gap-4"
        >
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              />
            }
          >
            Discussions
            {comments.length > 0 && (
              <span className="font-normal">
                {comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0)}
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4">
            {commentsQuery.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : commentsQuery.isError ? (
              <p className="text-sm text-muted-foreground">Failed to load comments.</p>
            ) : comments.length === 0 ? null : (
              <div className="flex flex-col divide-y divide-border">
                {comments.map((comment) => (
                  <div key={comment.id} className="pt-4 first:pt-0">
                    <CommentThread
                      comment={comment}
                      reactionPendingId={toggleReaction.isPending ? reactingToId : null}
                      onReact={(commentId, emoji) => toggleReaction.mutate({ commentId, emoji })}
                      replyingToId={replyingToId}
                      onStartReply={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                      replyBody={replyBody}
                      onReplyBodyChange={setReplyBody}
                      replySubmitting={postComment.isPending}
                      authorImage={currentUserImage}
                      authorName={currentUserName}
                      onCancelReply={() => {
                        setReplyingToId(null)
                        setReplyBody("")
                      }}
                      onSubmitReply={() =>
                        postComment.mutate(
                          { body: replyBody, parentCommentId: comment.id },
                          {
                            onSuccess: () => {
                              setReplyBody("")
                              setReplyingToId(null)
                            },
                          }
                        )
                      }
                      currentUserId={currentUserId}
                      editingCommentId={editingCommentId}
                      editBody={editBody}
                      onEditBodyChange={setEditBody}
                      onStartEdit={startEditingComment}
                      onSaveEdit={(commentId) => updateComment.mutate({ commentId, body: editBody })}
                      onCancelEdit={cancelEditingComment}
                      editSubmitting={updateComment.isPending}
                      onDelete={(commentId) => deleteComment.mutate(commentId)}
                      deletingCommentId={deletingCommentId}
                    />
                  </div>
                ))}
              </div>
            )}

            <CommentComposer
              value={newCommentBody}
              onChange={setNewCommentBody}
              placeholder="Write a comment..."
              submitting={postComment.isPending}
              authorImage={currentUserImage}
              authorName={currentUserName}
              onSubmit={() =>
                postComment.mutate({ body: newCommentBody }, { onSuccess: () => setNewCommentBody("") })
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </>
  )
}
