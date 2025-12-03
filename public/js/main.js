// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const noteList = document.getElementById('noteList');
  const newNoteBtn = document.getElementById('newNoteBtn');
  const quickSaveTitleInput = document.getElementById('quickSaveTitle');
  const quickSaveButton = document.getElementById('quickSaveButton');
  const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-action]');
  const toastEl = document.getElementById('toast');

  // Quick-save modal elements
  const quickSaveModal = document.getElementById('quickSaveModal');
  const ttlPreset = document.getElementById('ttlPreset');
  const passwordInput = document.getElementById('padPassword');
  const modalSaveBtn = document.getElementById('modalQuickSaveConfirm');
  const modalCancelBtn = document.getElementById('modalQuickSaveCancel');

  // Save-to-ID modal elements
  const saveIdModal = document.getElementById('saveIdModal');
  const idNumberInput = document.getElementById('idNumberInput');
  const idPasswordInput = document.getElementById('idPasswordInput');
  const saveIdCancelBtn = document.getElementById('saveIdCancel');
  const saveToIdConfirmBtn = document.getElementById('saveToIdConfirm');
  const loadFromIdBtn = document.getElementById('loadFromIdBtn');

  if (!editor || !noteList) return;

  let notes = [];
  let currentNoteId = null;
  let counter = 1;
  let toastTimeout = null;

  // ---------------------------------------------------------------------------
  // Toast helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------------

  function openQuickSaveModal() {
    if (!quickSaveModal) return;
    if (ttlPreset) ttlPreset.value = '60';
    if (passwordInput) passwordInput.value = '';
    quickSaveModal.classList.add('show');
    if (passwordInput) setTimeout(() => passwordInput.focus(), 10);
  }

  function closeQuickSaveModal() {
    if (!quickSaveModal) return;
    quickSaveModal.classList.remove('show');
  }

  function openSaveIdModal() {
    if (!saveIdModal) return;
    if (idNumberInput) idNumberInput.value = '';
    if (idPasswordInput) idPasswordInput.value = '';
    saveIdModal.classList.add('show');
    if (idNumberInput) setTimeout(() => idNumberInput.focus(), 10);
  }

  function closeSaveIdModal() {
    if (!saveIdModal) return;
    saveIdModal.classList.remove('show');
  }

  if (quickSaveModal) {
    quickSaveModal.addEventListener('click', (e) => {
      if (e.target === quickSaveModal) closeQuickSaveModal();
    });
  }

  if (saveIdModal) {
    saveIdModal.addEventListener('click', (e) => {
      if (e.target === saveIdModal) closeSaveIdModal();
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeQuickSaveModal);
  }
  if (saveIdCancelBtn) {
    saveIdCancelBtn.addEventListener('click', closeSaveIdModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (quickSaveModal && quickSaveModal.classList.contains('show')) {
      closeQuickSaveModal();
    } else if (saveIdModal && saveIdModal.classList.contains('show')) {
      closeSaveIdModal();
    }
  });

  // ---------------------------------------------------------------------------
  // Notes in this session
  // ---------------------------------------------------------------------------

  function deriveTitle(content, indexFallback) {
    const firstLine = (content || '').split('\n')[0].trim();
    if (!firstLine) return `Untitled note ${indexFallback}`;
    return firstLine.slice(0, 50);
  }

  function createLocalNote(initialContent = '') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const note = {
      id,
      content: initialContent,
      title: deriveTitle(initialContent, counter),
      updatedAt: Date.now(),
      padCode: null,
      ownerId: null
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
      padCode: pad.code,
      ownerId: pad.ownerId || null
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
      if (note.ownerId) {
        metaEl.textContent = `Saved to ${note.ownerId}`;
      } else if (note.padCode) {
        metaEl.textContent = 'Quick saved';
      } else {
        metaEl.textContent = 'Edited just now';
      }

      li.appendChild(titleEl);
      li.appendChild(metaEl);
      noteList.appendChild(li);
    });
  }

  // Sidebar: select note or copy code
  noteList.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.note-item-code-copy');
    if (copyBtn) {
      e.stopPropagation();
      const code = copyBtn.dataset.code;
      if (!code) return;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(code);
        } else {
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

  // ---------------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------------

  toolbarButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;

      // Load a pad by code (handles password-protected pads)
      if (action === 'load') {
        const code = window.prompt('Enter pad code (e.g. ABC123):');
        if (!code || !code.trim()) return;
        const normalized = code.trim().toUpperCase();

        async function fetchPad(password) {
          const url = password
            ? `/api/pad/${encodeURIComponent(
                normalized
              )}?password=${encodeURIComponent(password)}`
            : `/api/pad/${encodeURIComponent(normalized)}`;

          const res = await fetch(url, {
            headers: { Accept: 'application/json' }
          });
          const data = await res.json().catch(() => null);
          return { res, data };
        }

        try {
          let { res, data } = await fetchPad(null);

          if (res.status === 404) {
            showToast('Pad not found');
            return;
          }
          if (res.status === 410) {
            showToast('Pad has expired');
            return;
          }

          if (res.status === 401 || res.status === 403) {
            const pwdPrompt =
              res.status === 401
                ? 'This pad is password-protected. Enter password:'
                : 'Incorrect password. Try again:';
            const pwd = window.prompt(pwdPrompt);
            if (!pwd) {
              showToast('Password required to open pad');
              return;
            }
            ({ res, data } = await fetchPad(pwd));
          }

          if (!res.ok || !data || !data.ok || !data.pad) {
            showToast((data && data.error) || 'Failed to load pad');
            return;
          }

          createNoteFromPad(data.pad);
          showToast('Pad loaded into this session', normalized);
        } catch (err) {
          console.error(err);
          showToast('Network error while loading pad');
        }
      }

      // Save / load via ID number
      if (action === 'save-id') {
        openSaveIdModal();
      }

      // Copy whole note content
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

      // Paste into editor
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

      // Reset editor
      if (action === 'reset') {
        if (!editor.value || window.confirm('Clear all text in the editor?')) {
          editor.value = '';
          editor.dispatchEvent(new Event('input'));
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Quick save (modal)
  // ---------------------------------------------------------------------------

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
      const ttlMinutes = ttlPreset
        ? parseInt(ttlPreset.value, 10) || 60
        : 60;
      const password =
        passwordInput && passwordInput.value.trim()
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

  // ---------------------------------------------------------------------------
  // Save to ID modal actions
  // ---------------------------------------------------------------------------

  if (saveToIdConfirmBtn) {
    saveToIdConfirmBtn.addEventListener('click', async () => {
      const note = getCurrentNote();
      if (!note || !note.content || !note.content.trim()) {
        showToast('Pad is empty. Nothing to save.');
        return;
      }

      const idNumber = idNumberInput ? idNumberInput.value.trim() : '';
      const pwd = idPasswordInput ? idPasswordInput.value.trim() : '';

      if (!idNumber || !pwd) {
        showToast('ID number and password are required');
        return;
      }

      const payload = {
        idNumber,
        password: pwd,
        title: note.title || 'Untitled',
        content: note.content
      };

      try {
        const res = await fetch('/api/save-to-id', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.ok) {
          showToast((data && data.error) || 'Failed to save to your ID');
          return;
        }

        note.ownerId = data.ownerId || idNumber;
        renderNotes();
        closeSaveIdModal();
        showToast('Saved to your ID number', note.ownerId);
      } catch (err) {
        console.error(err);
        showToast('Network error while saving to ID');
      }
    });
  }

  if (loadFromIdBtn) {
    loadFromIdBtn.addEventListener('click', async () => {
      const idNumber = idNumberInput ? idNumberInput.value.trim() : '';
      const pwd = idPasswordInput ? idPasswordInput.value.trim() : '';

      if (!idNumber || !pwd) {
        showToast('ID number and password are required');
        return;
      }

      try {
        const res = await fetch('/api/list-id-pads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ idNumber, password: pwd })
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.ok) {
          showToast((data && data.error) || 'Failed to load pads');
          return;
        }

        const pads = data.pads || [];
        if (pads.length === 0) {
          showToast('No pads found for that ID');
          return;
        }

        pads.forEach((pad) => {
          createNoteFromPad(pad);
        });

        closeSaveIdModal();
        showToast('Loaded pads for', idNumber);
      } catch (err) {
        console.error(err);
        showToast('Network error while loading pads');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  createLocalNote('');
});
