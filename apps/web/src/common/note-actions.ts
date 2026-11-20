/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Fork: note actions shared by the list's keyboard shortcuts and swipe
 * gestures.
 */

import { strings } from "@notesnook/intl";
import { db } from "./db";
import { Multiselect } from "./multi-select";
import { store as noteStore } from "../stores/note-store";
import { store as trashStore } from "../stores/trash-store";
import { useEditorStore } from "../stores/editor-store";
import { AppEventManager, AppEvents } from "./app-events";
import { showToast } from "../utils/toast";
import { ConfirmDialog } from "../dialogs/confirm";
import { PromptDialog } from "../dialogs/prompt";
import { MoveNoteDialog } from "../dialogs/move-note-dialog";

export async function renameNote(noteId: string) {
  const note = await db.notes.note(noteId);
  if (!note) return;

  const title = await PromptDialog.show({
    title: strings.renameNote(),
    defaultValue: note.title,
    selectAll: true
  });
  const nextTitle = typeof title === "string" ? title.trim() : "";
  if (!nextTitle || nextTitle === note.title) return;

  await db.notes.add({ id: noteId, title: nextTitle });
  await noteStore.refresh();

  // keep open editors and their tabs in sync
  const editorStore = useEditorStore.getState();
  for (const session of editorStore.getSessionsForNote(noteId)) {
    editorStore.updateSession(session.id, undefined, (s) => {
      if (!("note" in s)) return;
      s.note.title = nextTitle;
      // tabs show session.title first; diff tabs keep their history label
      if (s.type !== "diff") s.title = nextTitle;
    });
    AppEventManager.publish(AppEvents.changeNoteTitle, {
      sessionId: session.id,
      title: nextTitle,
      preventSave: true
    });
  }
}

async function areAllArchived(ids: string[]) {
  const notes = await Promise.all(ids.map((id) => db.notes.note(id)));
  return notes.every((note) => !!note?.archived);
}

/** Delete key: ask, then archive (or unarchive notes that already are). */
export async function confirmArchiveNotes(ids: string[]) {
  if (ids.length === 0) return;
  const unarchive = await areAllArchived(ids);
  const result = await ConfirmDialog.show({
    title: unarchive
      ? strings.unarchiveNotesConfirm(ids.length)
      : strings.archiveNotesConfirm(ids.length),
    message: unarchive ? undefined : strings.archiveNotesDesc(),
    positiveButtonText: unarchive ? strings.unarchive() : strings.archive(),
    negativeButtonText: strings.cancel()
  });
  if (!result) return;
  await setArchived(ids, !unarchive, false);
}

/** ⌘Delete: ask, then move to trash. */
export async function confirmTrashNotes(ids: string[]) {
  if (ids.length === 0) return;
  await Multiselect.moveNotesToTrash(ids, true);
}

/** Archive (or unarchive) with an Undo button in the toast. */
export async function setArchived(
  ids: string[],
  archived: boolean,
  withUndo = true
) {
  await noteStore.archive(archived, ...ids);
  const { hide } = showToast(
    "success",
    archived
      ? strings.notesArchived(ids.length)
      : strings.notesUnarchived(ids.length),
    withUndo
      ? [
          {
            text: strings.undo(),
            onClick: async () => {
              hide();
              await noteStore.archive(!archived, ...ids);
            }
          }
        ]
      : undefined
  );
}

/** Move to trash without asking, with an Undo button in the toast. */
export async function trashNotesWithUndo(ids: string[]) {
  const deletable = ids.filter((id) => !db.monographs.isPublished(id));
  if (deletable.length === 0) return;
  await noteStore.delete(...deletable);
  const { hide } = showToast(
    "success",
    strings.actions.movedToTrash.note(deletable.length),
    [
      {
        text: strings.undo(),
        onClick: async () => {
          hide();
          await db.trash.restore(...deletable);
          await trashStore.refresh();
          await noteStore.refresh();
        }
      }
    ]
  );
}

export function togglePinned(ids: string[], pinned: boolean) {
  return noteStore.pin(pinned, ...ids);
}

export function toggleFavorite(ids: string[], favorite: boolean) {
  return noteStore.favorite(favorite, ...ids);
}

export async function linkNotebooks(ids: string[]) {
  await MoveNoteDialog.show({ noteIds: ids });
}
