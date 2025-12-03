document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const noteList = document.getElementById('noteList');
  const newNoteBtn = document.getElementById('newNoteBtn');
  const quickSaveTitleInput = document.getElementById('quickSaveTitle');
  const quickSaveButton = document.getElementById('quickSaveButton');
  const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-action]');
  const toastEl = document.getElementById('toast');

  // Modal elements
  const quickSaveModal = document.getElementById('quickSaveModal');
  const ttlPreset = document.getElementById('ttlPreset');
  const passwordInput = document.getElementById('padPassword');
  const modalSaveBtn = document.getElementById('modalQuickSaveConfirm');
  const modalCancelBtn = document.getElementById('modalQuickSaveCancel');

  if (!editor || !noteList) return;

  let notes = [];
  let currentNoteId = null;
  let counter = 1;
  let toastTimeout = null;

  // ------- Toast helpers -------

  function showToast(message, code) {
    if (!toastEl) return;

    toastEl.innerHTML = '';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toastEl.appendChild(msgSpan);

    if (code) {
      const codeSpan = document.createElement('span');
      codeSpan.className = 'toast-code';
      codeSpan.textContent = code;
      toastEl.appendChild(codeSpan);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      toastEl.classList.remove('show');
      if (toastTimeout) clearTimeout(toastTimeout);
    });
    toastEl.appendChild(closeBtn);

    toastEl.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 15000);
  }

  // ------- Modal helpers -------

  function openQuickSaveModal() {
    if (!quickSaveModal) return;
    if (ttlPreset) ttlPreset.value = '60'; // default 1h
    if (passwordInput) passwordInput.value = '';
    quickSaveModal.classList.add('show');
    if (passwordInput) {
      // small delay so browser applies display:flex first
      setTimeout(() => passwordInput.focus(), 10);
    }
  }

  function closeQuickSaveModal() {
    if (!quickSaveModal) return;
    quickSaveModal.classList.remove('show');
  }

  if (quickSaveModal) {
    quickSaveModal.addEventListener('click', (e) => {
      if (e.target === quickSaveModal) {
        closeQuickSaveModal();
      }
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      closeQuickSaveModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && quickSaveModal && quickSaveModal.classList.contains('show')) {
      closeQuickSaveModal();
    }
  });

  // ------- Notes in this session -------

  function deriveTitle(content, indexFallback) {
    const firstLine = (content || '').split('\n')[0].trim();
    if (firstLine.length === 0) {
      return `Untitled note ${indexFallback}`;
    }
    return firstLine.slice(0, 50);
  }

  function createLocalNote(initialContent = '') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const note = {
      id,
      content: initialContent,
      title: deriveTitle(initialContent, counter),
      updatedAt: Date.now(),
      padCode: null
    };
    notes.push(note);
    currentNoteId = id;
    counter += 1;
    renderNotes();
    editor.value = note.content;
    editor.focus();
  }

  function createNoteFromPad(pad) {
    const id = `pad-${pad.code}-${Date.now()}`;
    const initialContent = pad.content || '';
    const note = {
      id,
      content: initialContent,
      title: pad.title || deriveTitle(initialContent, counter),
      updatedAt: Date.now(),
      padCode: pad.code
    };
    notes.push(note);
    currentNoteId = id;
    counter += 1;
    renderNotes();
    editor.value = note.content;
    editor.focus();
  }

  function getCurrentNote() {
    return notes.find((n) => n.id === currentNoteId) || null;
  }

    function renderNotes() {
    noteList.innerHTML = '';

    if (notes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'note-item';
      empty.style.opacity = '0.6';
      empty.textContent = 'No notes yet. Click + to create one.';
      noteList.appendChild(empty);
      return;
    }

    notes.forEach((note, idx) => {
      const li = document.createElement('li');
      li.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
      li.dataset.id = note.id;

      const titleEl = document.createElement('div');
      titleEl.className = 'note-item-title';
      titleEl.textContent = note.title || `Untitled note ${idx + 1}`;

      if (note.padCode) {
        const codeWrapper = document.createElement('span');
        codeWrapper.className = 'note-item-code';

        const bullet = document.createElement('span');
        bullet.textContent = ' · ';
        codeWrapper.appendChild(bullet);

        const codeText = document.createElement('span');
        codeText.className = 'note-item-code-text';
        codeText.textContent = note.padCode;
        codeWrapper.appendChild(codeText);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'note-item-code-copy';
        copyBtn.title = 'Copy code';
        copyBtn.textContent = '⧉';
        copyBtn.dataset.code = note.padCode;
        codeWrapper.appendChild(copyBtn);

        titleEl.appendChild(codeWrapper);
      }

      const metaEl = document.createElement('div');
      metaEl.className = 'note-item-meta';
      metaEl.textContent = note.padCode ? 'Quick saved' : 'Edited just now';

      li.appendChild(titleEl);
      li.appendChild(metaEl);
      noteList.appendChild(li);
    });
  }


  // Note selection + copy code button
  noteList.addEventListener('click', async (e) => {
    // Copy code button
    const copyBtn = e.target.closest('.note-item-code-copy');
    if (copyBtn) {
      e.stopPropagation();
      const code = copyBtn.dataset.code;
      if (!code) return;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(code);
        } else {
          // Fallback
          const tmp = document.createElement('textarea');
          tmp.value = code;
          tmp.style.position = 'fixed';
          tmp.style.opacity = '0';
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand('copy');
          document.body.removeChild(tmp);
        }
        showToast('Code copied', code);
      } catch (err) {
        console.error('Copy code failed:', err);
        showToast('Failed to copy code');
      }
      return;
    }

    // Normal note selection
    const item = e.target.closest('.note-item');
    if (!item || !item.dataset.id) return;
    const id = item.dataset.id;
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    currentNoteId = id;
    editor.value = note.content;
    renderNotes();
    editor.focus();
  });

  // New note button
  newNoteBtn.addEventListener('click', () => {
    createLocalNote('');
  });

  // Editor typing
  editor.addEventListener('input', () => {
    const note = getCurrentNote();
    if (!note) return;
    note.content = editor.value;
    note.title = deriveTitle(editor.value, notes.indexOf(note) + 1);
    note.updatedAt = Date.now();
    renderNotes();
  });

  // ------- Toolbar actions (load, copy, paste, reset, save-id) -------

  toolbarButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;

      if (action === 'load') {
        const code = window.prompt('Enter pad code (e.g. ABC123):');
        if (!code || !code.trim()) return;
        const normalized = code.trim().toUpperCase();

        try {
          const res = await fetch(`/api/pad/${encodeURIComponent(normalized)}`, {
            headers: { Accept: 'application/json' }
          });

          if (res.status === 404) {
            showToast('Pad not found');
            return;
          }
          if (res.status === 410) {
            showToast('Pad has expired');
            return;
          }
          if (!res.ok) {
            showToast('Failed to load pad');
            return;
          }

          const data = await res.json();
          if (!data || !data.pad) {
            showToast('Invalid response from server');
            return;
          }

          createNoteFromPad(data.pad);
          showToast('Pad loaded into this session', normalized);
        } catch (err) {
          console.error(err);
          showToast('Network error while loading pad');
        }
      }

      if (action === 'save-id') {
        showToast('Save to your ID number is coming soon');
      }

      if (action === 'copy') {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(editor.value);
            showToast('Copied to clipboard');
          } else {
            editor.select();
            document.execCommand('copy');
            showToast('Copied to clipboard');
          }
        } catch (err) {
          console.error('Copy failed:', err);
          showToast('Copy failed');
        }
      }

      if (action === 'paste') {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            const sep = editor.value ? '\n' : '';
            editor.value += sep + text;
            editor.dispatchEvent(new Event('input'));
          } else {
            alert('Paste from clipboard works best over HTTPS or localhost.');
          }
        } catch (err) {
          console.error('Paste failed:', err);
          showToast('Paste failed');
        }
      }

      if (action === 'reset') {
        if (!editor.value || window.confirm('Clear all text in the editor?')) {
          editor.value = '';
          editor.dispatchEvent(new Event('input'));
        }
      }
    });
  });

  // ------- Quick save button -> open modal -------

  quickSaveButton.addEventListener('click', () => {
    const content = editor.value;
    const note = getCurrentNote();

    if (!content || !content.trim()) {
      showToast('Pad is empty. Nothing to save.');
      return;
    }

    if (note && note.padCode) {
      showToast('Already quick saved. Code:', note.padCode);
      return;
    }

    openQuickSaveModal();
  });

  // ------- Modal "Save pad" handler (actual quick save) -------

  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', async () => {
      const content = editor.value;
      const note = getCurrentNote();

      if (!content || !content.trim()) {
        showToast('Pad is empty. Nothing to save.');
        closeQuickSaveModal();
        return;
      }

      const title = note ? note.title || 'Untitled' : 'Untitled';
      const ttlMinutes = ttlPreset ? parseInt(ttlPreset.value, 10) || 60 : 60;
      const password = passwordInput && passwordInput.value.trim()
        ? passwordInput.value.trim()
        : null;

      quickSaveTitleInput.value = title;

      try {
        const res = await fetch('/quick-save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            title,
            content,
            ttlMinutes,
            password
          })
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.ok) {
          showToast((data && data.error) || 'Failed to save pad');
          return;
        }

        if (note) {
          note.padCode = data.code;
          renderNotes();
        }

        closeQuickSaveModal();
        showToast('Saved. Code:', data.code);
      } catch (err) {
        console.error(err);
        closeQuickSaveModal();
        showToast('Network error while saving pad');
      }
    });
  }

  // Start with one blank note
  createLocalNote('');
});
