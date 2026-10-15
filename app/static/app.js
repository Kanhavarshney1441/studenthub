(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    students: [], query: '', course: '', editing: null, viewing: null,
    sortBy: 'id', sortDirection: 1, page: 1, pageSize: 10
  };
  const fields = ['name', 'date_of_birth', 'enrollment_date', 'email', 'phone', 'course', 'address'];
  const fieldInput = {
    name: 'studentName', date_of_birth: 'studentDob', enrollment_date: 'studentEnrollment',
    email: 'studentEmail', phone: 'studentPhone', course: 'studentCourse', address: 'studentAddress'
  };
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  $('todayLabel').textContent = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = name => String(name || 'ST').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const prettyDate = value => {
    if (!value) return '—';
    const d = new Date(value + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  function toast(title, message = '', error = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' error' : '');
    el.innerHTML = `<span class="toast-mark">${error ? '!' : '✓'}</span><div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    $('toastRegion').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    } catch (e) {
      throw new Error('Could not connect to the API. Check that the server is running.');
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({ detail: response.statusText }));
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map(x => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ')
        : data.detail;
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return data;
  }

  function filtered() {
    const q = state.query.toLowerCase().trim();
    const rows = state.students.filter(s => {
      const text = [s.id, s.name, s.email, s.phone, s.course, s.address].join(' ').toLowerCase();
      return (!q || text.includes(q)) && (!state.course || (s.course || '') === state.course);
    });
    const key = state.sortBy;
    rows.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (key === 'id') return (Number(av) - Number(bv)) * state.sortDirection;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * state.sortDirection;
    });
    return rows;
  }

  function renderCourseChart() {
    const counts = new Map();
    state.students.forEach(s => {
      const course = (s.course || '').trim() || 'Not specified';
      counts.set(course, (counts.get(course) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
    const target = $('courseChart');
    if (!sorted.length) {
      target.innerHTML = '<p class="muted">Add student records to see course insights.</p>';
      return;
    }
    const max = Math.max(...sorted.map(([, n]) => n), 1);
    target.innerHTML = sorted.map(([name, count], i) => `
      <div class="course-bar-row">
        <div class="course-bar-label"><span title="${esc(name)}">${esc(name)}</span><strong>${count}</strong></div>
        <div class="course-bar-track"><i class="course-bar-fill fill-${i % 5}" style="width:${Math.max(5, count / max * 100)}%"></i></div>
      </div>`).join('');
  }

  function renderQuality(total) {
    const emails = state.students.filter(s => s.email).length;
    const phones = state.students.filter(s => s.phone).length;
    const missingCourse = state.students.filter(s => !String(s.course || '').trim()).length;
    const emailPercent = total ? Math.round(emails / total * 100) : 0;
    const phonePercent = total ? Math.round(phones / total * 100) : 0;
    $('qualityEmail').textContent = `${emails} (${emailPercent}%)`;
    $('qualityPhone').textContent = `${phones} (${phonePercent}%)`;
    $('qualityCourseMissing').textContent = missingCourse;
    $('qualityEmailBar').style.width = `${emailPercent}%`;
    $('qualityPhoneBar').style.width = `${phonePercent}%`;
  }

  function render() {
    const rows = filtered();
    const total = state.students.length;
    $('totalStudents').textContent = total;
    $('navCount').textContent = total;
    $('recordCount').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    $('totalCourses').textContent = new Set(state.students.map(s => (s.course || '').trim()).filter(Boolean)).size;
    $('emailContacts').textContent = state.students.filter(s => s.email).length;
    const recent = state.students.filter(s => {
      const d = new Date((s.enrollment_date || '') + 'T00:00:00');
      return !Number.isNaN(d.getTime()) && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length;
    $('newThisMonth').textContent = recent;
    $('monthNote').textContent = today.toLocaleDateString(undefined, { month: 'long' }) + ' admissions';

    const courses = [...new Set(state.students.map(s => (s.course || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const select = $('courseFilter');
    const old = state.course;
    select.innerHTML = '<option value="">All courses</option>' + courses.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    select.value = courses.includes(old) ? old : '';
    state.course = select.value;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    const body = $('studentsTableBody');
    $('emptyState').classList.toggle('hidden', rows.length !== 0);
    body.innerHTML = pageRows.map(s => `
      <tr>
        <td><span class="id-badge">#${s.id}</span></td>
        <td><div class="student-cell"><span class="avatar">${esc(initials(s.name))}</span><div><div class="student-name">${esc(s.name)}</div><div class="student-email">${esc(s.email || 'No email provided')}</div></div></div></td>
        <td>${s.course ? `<span class="course-pill">${esc(s.course)}</span>` : '<span class="muted">Not specified</span>'}</td>
        <td><div class="contact-cell">${esc(s.phone || s.email || '—')}</div></td>
        <td>${esc(prettyDate(s.date_of_birth))}</td><td>${esc(prettyDate(s.enrollment_date))}</td>
        <td><div class="actions">
          <button class="action-btn" title="View details" aria-label="View details" data-action="view" data-id="${s.id}"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button>
          <button class="action-btn" title="Edit student" aria-label="Edit student" data-action="edit" data-id="${s.id}"><svg viewBox="0 0 24 24"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/></svg></button>
          <button class="action-btn delete" title="Delete student" aria-label="Delete student" data-action="delete" data-id="${s.id}"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg></button>
        </div></td>
      </tr>`).join('');

    $('emptyTitle').textContent = total ? 'No matching students' : 'No students yet';
    $('emptyDescription').textContent = total ? 'Try changing your search or course filter.' : 'Add your first student to start building your database.';
    $('tableFooterLabel').textContent = rows.length ? `Showing ${start + 1}–${Math.min(start + state.pageSize, rows.length)} of ${rows.length} filtered (${total} total)` : 'No records to display';
    $('pageLabel').textContent = `Page ${state.page} of ${totalPages}`;
    $('prevPage').disabled = state.page <= 1;
    $('nextPage').disabled = state.page >= totalPages;
    $('sortDirection').textContent = state.sortDirection === 1 ? '↑ Asc' : '↓ Desc';
    $('sortDirection').setAttribute('aria-label', state.sortDirection === 1 ? 'Ascending sort. Switch to descending' : 'Descending sort. Switch to ascending');
    renderCourseChart();
    renderQuality(total);
  }

  async function load() {
    $('refreshButton').disabled = true;
    $('refreshButton').classList.add('is-loading');
    try {
      const all = [];
      let offset = 0;
      while (true) {
        const batch = await api(`/students?limit=100&offset=${offset}`);
        all.push(...batch);
        if (batch.length < 100) break;
        offset += 100;
      }
      state.students = all;
      render();
    } catch (e) {
      $('studentsTableBody').innerHTML = `<tr><td colspan="7"><div class="loading-state">${esc(e.message)}</div></td></tr>`;
      toast('Could not load students', e.message, true);
    } finally {
      $('refreshButton').disabled = false;
      $('refreshButton').classList.remove('is-loading');
    }
  }

  function openForm(student = null) {
    state.editing = student;
    $('studentForm').reset();
    document.querySelectorAll('[data-error-for]').forEach(e => e.textContent = '');
    document.querySelectorAll('.form-field input').forEach(e => e.classList.remove('invalid'));
    $('studentId').value = student?.id || '';
    $('studentModalTitle').textContent = student ? 'Edit student' : 'Add a student';
    $('modalEyebrow').textContent = student ? `EDIT RECORD #${student.id}` : 'NEW STUDENT RECORD';
    $('studentModalDescription').textContent = student ? 'Update the details and save your changes.' : 'Enter the student details below.';
    $('saveButtonText').textContent = student ? 'Save changes' : 'Save student';
    const values = {
      name: student?.name || '', date_of_birth: student?.date_of_birth || '',
      enrollment_date: student?.enrollment_date || todayIso, email: student?.email || '',
      phone: student?.phone || '', course: student?.course || '', address: student?.address || ''
    };
    for (const f of fields) $(fieldInput[f]).value = values[f];
    $('studentModalBackdrop').classList.remove('hidden');
    setTimeout(() => $('studentName').focus(), 50);
  }

  function closeForm() {
    $('studentModalBackdrop').classList.add('hidden');
    state.editing = null;
  }

  async function saveForm(event) {
    event.preventDefault();
    const values = {
      name: $('studentName').value.trim(), date_of_birth: $('studentDob').value,
      enrollment_date: $('studentEnrollment').value, email: $('studentEmail').value.trim() || null,
      phone: $('studentPhone').value.trim() || null, course: $('studentCourse').value.trim() || null,
      address: $('studentAddress').value.trim() || null
    };
    if (!values.name || !values.date_of_birth || !values.enrollment_date) {
      toast('Check required fields', 'Name, date of birth and enrollment date are required.', true); return;
    }
    if (!values.email && !values.phone) {
      toast('Contact information required', 'Enter an email address or a phone number.', true); return;
    }
    if (values.date_of_birth > todayIso) {
      toast('Invalid date', 'Date of birth cannot be in the future.', true); return;
    }
    if (values.enrollment_date < values.date_of_birth) {
      toast('Check the dates', 'Enrollment date should not be earlier than date of birth.', true); return;
    }
    const button = $('saveStudentButton');
    button.disabled = true; $('saveSpinner').classList.remove('hidden');
    try {
      if (state.editing) {
        await api(`/students/${state.editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
        toast('Student updated', 'Changes were saved to the database.');
      } else {
        await api('/students', { method: 'POST', body: JSON.stringify(values) });
        toast('Student added', 'New record saved to the database.');
      }
      closeForm(); state.page = 1; await load();
    } catch (e) { toast('Could not save student', e.message, true); }
    finally { button.disabled = false; $('saveSpinner').classList.add('hidden'); }
  }

  function openView(s) {
    state.viewing = s;
    $('detailStudentName').textContent = s.name;
    $('detailStudentId').textContent = `Student ID #${s.id}`;
    $('detailAvatar').textContent = initials(s.name);
    $('detailCourse').textContent = s.course || 'No course listed';
    $('detailAddress').textContent = s.address || 'Address not provided';
    const items = [['Email', s.email], ['Phone', s.phone], ['Date of birth', prettyDate(s.date_of_birth)], ['Enrollment date', prettyDate(s.enrollment_date)], ['Course', s.course], ['Address', s.address]];
    $('detailGrid').innerHTML = items.map(([k, v]) => `<div class="detail-item"><span class="detail-label">${esc(k)}</span><span class="detail-value">${esc(v || '—')}</span></div>`).join('');
    $('viewModalBackdrop').classList.remove('hidden');
  }

  async function deleteStudent(id) {
    const s = state.students.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete ${s.name} (ID #${id})? This cannot be undone.`)) return;
    try {
      await api(`/students/${id}`, { method: 'DELETE' });
      toast('Student deleted', `${s.name} was removed from the database.`);
      await load();
    } catch (e) { toast('Delete failed', e.message, true); }
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadFile(filename, contents, type = 'text/csv;charset=utf-8;') {
    const blob = new Blob(['\uFEFF', contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCsv() {
    const rows = filtered();
    if (!rows.length) { toast('Nothing to export', 'No students match the current filters.', true); return; }
    const headers = ['id', 'name', 'date_of_birth', 'enrollment_date', 'email', 'phone', 'course', 'address'];
    const csv = [headers.join(','), ...rows.map(s => headers.map(h => csvEscape(s[h])).join(','))].join('\r\n');
    downloadFile(`studenthub-students-${todayIso}.csv`, csv);
    toast('CSV exported', `${rows.length} student record(s) exported with current filters.`);
  }
  function downloadTemplate() {
    const headers = ['name', 'date_of_birth', 'enrollment_date', 'email', 'phone', 'course', 'address'];
    downloadFile('studenthub-import-template.csv', headers.join(',') + '\r\n', 'text/csv;charset=utf-8;');
    toast('CSV template downloaded', 'Use YYYY-MM-DD for both date fields. Add email or phone for each student.');
  }
  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim().replace(/\r$/, '')); if (row.some(v => v !== '')) rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell.trim().replace(/\r$/, ''));
    if (row.some(v => v !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('CSV must have a header row and at least one student row.');
    const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const headers = rows[0].map(norm);
    const aliases = {
      name: ['name', 'studentname', 'fullname'], date_of_birth: ['dateofbirth', 'dob', 'birthdate'],
      enrollment_date: ['enrollmentdate', 'enrolled', 'admissiondate'], email: ['email', 'emailaddress'],
      phone: ['phone', 'phonenumber', 'contact'], course: ['course', 'program'], address: ['address']
    };
    const index = {};
    Object.entries(aliases).forEach(([field, names]) => { index[field] = headers.findIndex(h => names.includes(h)); });
    if (index.name < 0 || index.date_of_birth < 0) throw new Error('CSV needs at least name and date_of_birth (or DOB) columns.');
    return rows.slice(1).map((r, i) => {
      const val = field => index[field] >= 0 ? (r[index[field]] || '').trim() : '';
      const record = {
        name: val('name'), date_of_birth: val('date_of_birth'), enrollment_date: val('enrollment_date') || todayIso,
        email: val('email') || null, phone: val('phone') || null, course: val('course') || null, address: val('address') || null
      };
      if (!record.name || !/^\d{4}-\d{2}-\d{2}$/.test(record.date_of_birth) || !/^\d{4}-\d{2}-\d{2}$/.test(record.enrollment_date)) {
        throw new Error(`Row ${i + 2}: name and dates are required; use YYYY-MM-DD dates.`);
      }
      if (!record.email && !record.phone) throw new Error(`Row ${i + 2}: add an email address or phone number.`);
      return record;
    });
  }
  async function importCsv(file) {
    try {
      const text = await file.text();
      const records = parseCsv(text);
      if (!confirm(`Import ${records.length} student record(s) into SQLite? Existing records will not be changed.`)) return;
      let added = 0; const errors = [];
      for (let i = 0; i < records.length; i++) {
        try { await api('/students', { method: 'POST', body: JSON.stringify(records[i]) }); added++; }
        catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); }
      }
      state.page = 1; await load();
      if (errors.length) toast('CSV import completed with some errors', `${added} added, ${errors.length} failed. First error: ${errors[0]}`, true);
      else toast('CSV import successful', `${added} student record(s) were added.`);
    } catch (e) { toast('Could not import CSV', e.message, true); }
    finally { $('importCsvInput').value = ''; }
  }

  function setTheme(dark) {
    document.body.classList.toggle('dark-mode', dark);
    $('themeToggle').innerHTML = dark ? '☀ <span id="themeToggleLabel">Light mode</span>' : '☾ <span id="themeToggleLabel">Dark mode</span>';
    $('themeToggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem('studenthub-theme', dark ? 'dark' : 'light'); } catch (_) { /* storage may be disabled */ }
  }
  function initTheme() {
    let dark = false;
    try { dark = localStorage.getItem('studenthub-theme') === 'dark'; } catch (_) { /* ignore */ }
    setTheme(dark);
  }

  $('studentForm').addEventListener('submit', saveForm);
  $('addStudentButton').addEventListener('click', () => openForm());
  $('emptyAddButton').addEventListener('click', () => openForm());
  $('refreshButton').addEventListener('click', load);
  $('searchInput').addEventListener('input', e => { state.query = e.target.value; state.page = 1; render(); });
  $('courseFilter').addEventListener('change', e => { state.course = e.target.value; state.page = 1; render(); });
  $('sortBy').addEventListener('change', e => { state.sortBy = e.target.value; state.page = 1; render(); });
  $('sortDirection').addEventListener('click', () => { state.sortDirection *= -1; render(); });
  $('pageSize').addEventListener('change', e => { state.pageSize = Number(e.target.value) || 10; state.page = 1; render(); });
  $('prevPage').addEventListener('click', () => { state.page--; render(); });
  $('nextPage').addEventListener('click', () => { state.page++; render(); });
  $('exportCsvButton').addEventListener('click', exportCsv);
  $('downloadTemplateButton').addEventListener('click', downloadTemplate);
  $('importCsvButton').addEventListener('click', () => $('importCsvInput').click());
  $('importCsvInput').addEventListener('change', e => { const file = e.target.files?.[0]; if (file) importCsv(file); });
  $('themeToggle').addEventListener('click', () => setTheme(!document.body.classList.contains('dark-mode')));
  $('studentsTableBody').addEventListener('click', e => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const id = Number(b.dataset.id), s = state.students.find(x => x.id === id); if (!s) return;
    if (b.dataset.action === 'view') openView(s);
    if (b.dataset.action === 'edit') openForm(s);
    if (b.dataset.action === 'delete') deleteStudent(id);
  });
  $('closeStudentModal').addEventListener('click', closeForm);
  $('cancelStudentModal').addEventListener('click', closeForm);
  $('closeViewModal').addEventListener('click', () => $('viewModalBackdrop').classList.add('hidden'));
  $('closeViewDone').addEventListener('click', () => $('viewModalBackdrop').classList.add('hidden'));
  $('editFromView').addEventListener('click', () => { const s = state.viewing; $('viewModalBackdrop').classList.add('hidden'); if (s) openForm(s); });
  for (const id of ['studentModalBackdrop', 'viewModalBackdrop']) $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.add('hidden'); });
  $('mobileMenu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('studentsNav').addEventListener('click', () => $('sidebar').classList.remove('open'));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('searchInput').focus(); }
    if (e.key === 'Escape') { closeForm(); $('viewModalBackdrop').classList.add('hidden'); }
  });
  initTheme();
  load();
})();
