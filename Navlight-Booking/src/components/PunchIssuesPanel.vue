<template>
  <section class="issues-wrap">
    <div class="issues-header">
      <div>
        <h3>Punch Issues</h3>
        <p>Track punch problems and their resolution status.</p>
      </div>
      <button @click="startCreate" class="btn">Add Issue</button>
    </div>

    <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
    <div v-if="successMessage" class="success">{{ successMessage }}</div>

    <div v-if="showForm" class="issue-form-card">
      <h4>{{ editingIssueId ? 'Edit Issue' : 'Add Issue' }}</h4>
      <div class="issue-form-grid">
        <label>
          <span>Set</span>
          <select v-model="form.set">
            <option value="Set1">Set 1</option>
            <option value="Set2">Set 2</option>
          </select>
        </label>

        <label>
          <span>Punch</span>
          <input v-model="form.punch" placeholder="e.g. 101" />
        </label>

        <label class="span-2">
          <span>Issue</span>
          <textarea v-model="form.issue" rows="3" placeholder="Describe the punch issue"></textarea>
        </label>

        <label class="span-2">
          <span>Resolution</span>
          <textarea v-model="form.resolution" rows="3" placeholder="Optional resolution details"></textarea>
        </label>

        <label>
          <span>Date Opened</span>
          <input v-model="form.dateOpened" type="date" />
        </label>

        <label>
          <span>Status</span>
          <select v-model="form.status">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>

        <label>
          <span>Date Resolved</span>
          <input v-model="form.dateResolved" type="date" :disabled="form.status !== 'resolved'" />
        </label>
      </div>

      <div class="form-actions">
        <button @click="saveIssue" class="btn" :disabled="saving">{{ saving ? 'Saving...' : 'Save Issue' }}</button>
        <button @click="cancelForm" class="btn secondary" :disabled="saving">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">Loading issues...</div>
    <div v-else-if="issues.length" class="table-wrap">
      <table class="issues-table">
        <thead>
          <tr>
            <th>Issue #</th>
            <th>
              <button type="button" class="sort-btn" @click="toggleSort('set')">
                Set {{ getSortIndicator('set') }}
              </button>
            </th>
            <th>
              <button type="button" class="sort-btn" @click="toggleSort('punch')">
                Punch {{ getSortIndicator('punch') }}
              </button>
            </th>
            <th>Issue</th>
            <th>Resolution</th>
            <th>
              <button type="button" class="sort-btn" @click="toggleSort('dateOpened')">
                Date Opened {{ getSortIndicator('dateOpened') }}
              </button>
            </th>
            <th>
              <button type="button" class="sort-btn" @click="toggleSort('dateResolved')">
                Date Resolved {{ getSortIndicator('dateResolved') }}
              </button>
            </th>
            <th>
              <button type="button" class="sort-btn" @click="toggleSort('status')">
                Status {{ getSortIndicator('status') }}
              </button>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="issue in sortedIssues" :key="issue.id">
            <td>{{ issue.id }}</td>
            <td>{{ issue.set }}</td>
            <td>{{ issue.punch }}</td>
            <td>{{ issue.issue }}</td>
            <td>{{ issue.resolution || 'Not resolved yet' }}</td>
            <td>{{ formatDate(issue.dateOpened) }}</td>
            <td>{{ formatDate(issue.dateResolved) || 'Open' }}</td>
            <td>
              <span :class="['status-pill', issue.status]">{{ issue.status }}</span>
            </td>
            <td>
              <div class="row-actions">
                <button @click="startEdit(issue)" class="btn secondary small-btn">Edit</button>
                <button @click="startCopy(issue)" class="btn secondary small-btn">Copy</button>
                <button @click="deleteIssue(issue)" class="btn danger small-btn">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state">No punch issues logged.</div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createPunchIssue, deletePunchIssue, fetchPunchIssues, updatePunchIssue } from '../api/bookings.js'

const props = defineProps({
  adminToken: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['session-expired'])

const issues = ref([])
const loading = ref(false)
const saving = ref(false)
const showForm = ref(false)
const editingIssueId = ref(null)
const errorMessage = ref('')
const successMessage = ref('')
const form = ref(createEmptyForm())
const sortKey = ref('status')
const sortDirection = ref('asc')

function createEmptyForm() {
  return {
    set: 'Set1',
    punch: '',
    issue: '',
    resolution: '',
    dateOpened: todayDate(),
    dateResolved: '',
    status: 'open',
  }
}

function todayDate() {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDateValue(value) {
  if (!value) return ''

  const stringValue = String(value)
  const datePart = stringValue.includes('T') ? stringValue.split('T')[0] : stringValue
  const [year, month, day] = datePart.split('-')

  if (!year || !month || !day) return ''
  return `${year}-${month}-${day}`
}

function formatDate(value) {
  const normalizedValue = normalizeDateValue(value)
  if (!normalizedValue) return ''

  const [year, month, day] = normalizedValue.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function compareIssueValues(left, right, key) {
  if (key === 'dateOpened' || key === 'dateResolved') {
    return normalizeDateValue(left[key]).localeCompare(normalizeDateValue(right[key]))
  }

  if (key === 'punch') {
    return String(left.punch || '').localeCompare(String(right.punch || ''), undefined, { numeric: true, sensitivity: 'base' })
  }

  if (key === 'status') {
    const statusOrder = { open: 0, resolved: 1 }
    return (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99)
  }

  return String(left[key] || '').localeCompare(String(right[key] || ''), undefined, { sensitivity: 'base' })
}

const sortedIssues = computed(() => {
  const direction = sortDirection.value === 'asc' ? 1 : -1

  return [...issues.value].sort((left, right) => {
    const primaryComparison = compareIssueValues(left, right, sortKey.value)
    if (primaryComparison !== 0) {
      return primaryComparison * direction
    }

    return compareIssueValues(left, right, 'dateOpened') * -1
  })
})

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }

  sortKey.value = key
  sortDirection.value = key === 'set' || key === 'punch' || key === 'status' ? 'asc' : 'desc'
}

function getSortIndicator(key) {
  if (sortKey.value !== key) return ''
  return sortDirection.value === 'asc' ? '▲' : '▼'
}

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function resetForm() {
  form.value = createEmptyForm()
  editingIssueId.value = null
  showForm.value = false
}

function handleIssueError(error, fallbackMessage) {
  const message = error?.message || fallbackMessage
  if (message.toLowerCase().includes('unauthorized')) {
    emit('session-expired')
    return
  }
  errorMessage.value = message
}

async function loadIssues() {
  if (!props.adminToken) {
    issues.value = []
    return
  }

  loading.value = true
  clearMessages()

  try {
    issues.value = await fetchPunchIssues(props.adminToken)
  } catch (error) {
    handleIssueError(error, 'Failed to fetch punch issues.')
  } finally {
    loading.value = false
  }
}

function startCreate() {
  clearMessages()
  form.value = createEmptyForm()
  editingIssueId.value = null
  showForm.value = true
}

function startEdit(issue) {
  clearMessages()
  form.value = {
    set: issue.set || 'Set1',
    punch: issue.punch || '',
    issue: issue.issue || '',
    resolution: issue.resolution || '',
    dateOpened: normalizeDateValue(issue.dateOpened) || todayDate(),
    dateResolved: normalizeDateValue(issue.dateResolved),
    status: issue.status || 'open',
  }
  editingIssueId.value = issue.id
  showForm.value = true
}

function startCopy(issue) {
  clearMessages()
  form.value = {
    set: issue.set || 'Set1',
    punch: issue.punch || '',
    issue: issue.issue || '',
    resolution: '',
    dateOpened: todayDate(),
    dateResolved: '',
    status: 'open',
  }
  editingIssueId.value = null
  showForm.value = true
}

function cancelForm() {
  clearMessages()
  resetForm()
}

async function saveIssue() {
  saving.value = true
  clearMessages()

  try {
    if (editingIssueId.value) {
      await updatePunchIssue(editingIssueId.value, form.value, props.adminToken)
      successMessage.value = 'Punch issue updated.'
    } else {
      await createPunchIssue(form.value, props.adminToken)
      successMessage.value = 'Punch issue added.'
    }

    await loadIssues()
    resetForm()
  } catch (error) {
    handleIssueError(error, 'Failed to save punch issue.')
  } finally {
    saving.value = false
  }
}

async function deleteIssue(issue) {
  clearMessages()

  if (!window.confirm(`Delete punch issue for ${issue.set} / punch ${issue.punch}?`)) {
    return
  }

  try {
    await deletePunchIssue(issue.id, props.adminToken)
    successMessage.value = 'Punch issue deleted.'
    await loadIssues()

    if (editingIssueId.value === issue.id) {
      resetForm()
    }
  } catch (error) {
    handleIssueError(error, 'Failed to delete punch issue.')
  }
}

watch(
  () => props.adminToken,
  (token) => {
    if (!token) {
      issues.value = []
      resetForm()
      clearMessages()
      return
    }
    loadIssues()
  },
  { immediate: true },
)

watch(
  () => form.value.status,
  (status, previousStatus) => {
    if (!showForm.value) return

    if (status === 'resolved') {
      if (!form.value.dateResolved || previousStatus !== 'resolved') {
        form.value.dateResolved = todayDate()
      }
      return
    }

    form.value.dateResolved = ''
  },
)
</script>

<style scoped>
.issues-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.issues-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.issues-header h3 {
  margin: 0;
  color: #1f2a44;
}

.issues-header p {
  margin: 6px 0 0;
  color: #64748b;
}

.issue-form-card {
  border: 1px solid #e3e8f2;
  border-radius: 12px;
  background: #fbfcff;
  padding: 16px;
}

.issue-form-card h4 {
  margin: 0 0 12px;
  color: #1e293b;
}

.issue-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.issue-form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.span-2 {
  grid-column: span 2;
}

input,
select,
textarea {
  border: 1px solid #d3dce8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #ffffff;
  font: inherit;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.btn {
  border: none;
  border-radius: 10px;
  background: #1d4ed8;
  color: #fff;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover {
  background: #1b45bf;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.btn.secondary:hover {
  background: #cfd8e4;
}

.small-btn {
  padding: 6px 10px;
}

.btn.danger {
  background: #c62828;
}

.btn.danger:hover {
  background: #ab1f1f;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.table-wrap {
  overflow-x: auto;
}

.issues-table {
  width: 100%;
  border-collapse: collapse;
}

.issues-table th,
.issues-table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid #e6eaf2;
  vertical-align: top;
}

.issues-table th {
  color: #475569;
  font-size: 13px;
}

.sort-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.sort-btn:hover {
  color: #1d4ed8;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.status-pill.open {
  background: #fff4e5;
  color: #b45309;
}

.status-pill.resolved {
  background: #e8f7ed;
  color: #166534;
}

.loading-state,
.empty-state {
  color: #64748b;
}

.error {
  color: #b42318;
  background: #feeceb;
  border: 1px solid #f7cac7;
  border-radius: 10px;
  padding: 8px 10px;
}

.success {
  color: #166534;
  background: #edfdf3;
  border: 1px solid #b7ebc6;
  border-radius: 10px;
  padding: 8px 10px;
}

@media (max-width: 820px) {
  .issues-header {
    flex-direction: column;
    align-items: stretch;
  }

  .issue-form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }
}
</style>