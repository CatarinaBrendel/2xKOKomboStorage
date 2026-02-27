import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

function ToolButton({ label, onClick, active = false, title }) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title || label}
			className={`px-2 py-1 rounded text-xs border ${
				active
					? 'bg-[var(--color-accent-primary)] text-white border-[var(--color-accent-primary)]'
					: 'bg-[rgba(255,255,255,0.02)] text-text-muted border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.04)]'
			}`}
		>
			{label}
		</button>
	)
}

export default function RichTextEditor({
	value = '',
	onChange = () => {},
	placeholder = 'Write something…',
	minHeight = 360,
	maxHeight = 360
}) {
	const resolvedMaxHeight = maxHeight ?? minHeight
	const [toolbarState, setToolbarState] = useState({
		h2: false,
		h3: false,
		paragraph: false,
		bold: false,
		italic: false,
		bulletList: false,
		orderedList: false,
		taskList: false,
		blockquote: false,
		link: false
	})

	const updateToolbarState = useCallback((tiptapEditor) => {
		if (!tiptapEditor) return

		const next = {
			h2: tiptapEditor.isActive('heading', { level: 2 }),
			h3: tiptapEditor.isActive('heading', { level: 3 }),
			paragraph: tiptapEditor.isActive('paragraph'),
			bold: tiptapEditor.isActive('bold'),
			italic: tiptapEditor.isActive('italic'),
			bulletList: tiptapEditor.isActive('bulletList'),
			orderedList: tiptapEditor.isActive('orderedList'),
			taskList: tiptapEditor.isActive('taskList'),
			blockquote: tiptapEditor.isActive('blockquote'),
			link: tiptapEditor.isActive('link')
		}

		setToolbarState((prev) => {
			if (
				prev.h2 === next.h2 &&
				prev.h3 === next.h3 &&
				prev.paragraph === next.paragraph &&
				prev.bold === next.bold &&
				prev.italic === next.italic &&
				prev.bulletList === next.bulletList &&
				prev.orderedList === next.orderedList &&
				prev.taskList === next.taskList &&
				prev.blockquote === next.blockquote &&
				prev.link === next.link
			) {
				return prev
			}
			return next
		})
	}, [])

	const sanitizedInitial = useMemo(() => DOMPurify.sanitize(value || ''), [value])

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [2, 3] }
			}),
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					rel: 'noopener noreferrer',
					target: '_blank'
				}
			}),
			Placeholder.configure({
				placeholder
			}),
			TaskList,
			TaskItem.configure({
				nested: true
			})
		],
		content: sanitizedInitial,
		editorProps: {
			attributes: {
				class:
					'richtext-editor-content text-sm focus:outline-none leading-relaxed px-3 py-2'
			}
		},
		onUpdate: ({ editor: tiptapEditor }) => {
			const html = tiptapEditor.getHTML()
			onChange(DOMPurify.sanitize(html))
			updateToolbarState(tiptapEditor)
		},
		onSelectionUpdate: ({ editor: tiptapEditor }) => {
			updateToolbarState(tiptapEditor)
		},
		onCreate: ({ editor: tiptapEditor }) => {
			updateToolbarState(tiptapEditor)
		}
	})

	useEffect(() => {
		if (!editor) return
		const incoming = DOMPurify.sanitize(value || '')
		const current = editor.getHTML()
		if (incoming !== current) {
			editor.commands.setContent(incoming, { emitUpdate: false })
		}
	}, [editor, value])

	if (!editor) {
		return (
			<div
				className="w-full rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)]"
				style={{ minHeight, maxHeight: resolvedMaxHeight, overflowY: 'auto' }}
			/>
		)
	}

	function setLink() {
		const previousUrl = editor.getAttributes('link').href || ''
		const url = window.prompt('Enter URL', previousUrl)

		if (url === null) return
		if (url === '') {
			editor.chain().focus().unsetLink().run()
			return
		}

		editor.chain().focus().setLink({ href: url }).run()
	}

	function addTaskItem() {
		if (editor.isActive('taskList')) {
			editor.chain().focus().splitListItem('taskItem').run()
			return
		}
		editor.chain().focus().toggleTaskList().run()
	}

	return (
		<div className="w-full rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)] overflow-hidden">
			<div className="flex flex-wrap items-center gap-1 p-2 border-b border-[rgba(255,255,255,0.06)]">
				<ToolButton label="H2" title="Heading 2" active={toolbarState.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
				<ToolButton label="H3" title="Heading 3" active={toolbarState.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
				<ToolButton label="P" title="Paragraph" active={toolbarState.paragraph} onClick={() => editor.chain().focus().setParagraph().run()} />
				<ToolButton label="B" title="Bold" active={toolbarState.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
				<ToolButton label="I" title="Italic" active={toolbarState.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
				<ToolButton label="• List" title="Bullet list" active={toolbarState.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
				<ToolButton label="1. List" title="Numbered list" active={toolbarState.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
				<ToolButton label="Task List" title="Task list" active={toolbarState.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()} />
				<ToolButton label="Task Item" title="Add task item" onClick={addTaskItem} />
				<ToolButton label="Quote" title="Blockquote" active={toolbarState.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
				<ToolButton label="HR" title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
				<ToolButton label="Link" title="Insert link" active={toolbarState.link} onClick={setLink} />
				<ToolButton label="Clear" title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} />
			</div>

			<div style={{ minHeight, maxHeight: resolvedMaxHeight }} className="overflow-y-auto">
				<EditorContent editor={editor} />
			</div>
		</div>
	)
}
