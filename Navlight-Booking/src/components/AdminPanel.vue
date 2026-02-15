<template>
  <div class="admin-wrap">
    <h2>Admin Panel</h2>
    <div v-if="!adminToken">
      <div class="dialog login-card">
        <h3>Admin Login</h3>
        <input type="password" v-model="adminPassword" placeholder="Enter admin password" @keyup.enter="login" />
        <div v-if="loginError" class="error">{{ loginError }}</div>
        <button @click="login">Login</button>
      </div>
    </div>
    <div v-else>
      <div v-if="actionError" class="error action-error">{{ actionError }}</div>
      <div v-if="actionSuccess" class="success action-success">{{ actionSuccess }}</div>
      <ul v-if="bookings.length">
        <li v-for="booking in bookings" :key="booking.id" class="admin-booking">
          <div>
            <strong>{{ booking.eventName }}</strong> ({{ booking.navlightSet }})<br>
            Name: {{ booking.name }}<br>
            Pickup: {{ formatDisplayDate(booking.pickupDate) }} | Event: {{ formatDisplayDate(booking.eventDate) }} | Return: {{ formatDisplayDate(booking.returnDate) }}<br>
            Status: {{ normalizeStatus(booking.status) }}
          </div>
          <div v-if="isBookedStatus(booking.status)">
            <button @click="startPickup(booking)">Mark as Picked Up</button>
          </div>
          <div v-if="booking.status === 'pickedup'">
            <div>
              Picked up: {{ formatDisplayDate(booking.actualPickupDate) }}<br>
              Missing punches: {{ booking.pickupMissingPunches?.join(', ') || 'None' }}
            </div>
            <button @click="startReturn(booking)">Mark as Returned</button>
          </div>
          <div v-if="booking.status === 'returned'">
            <div>
              Returned: {{ formatDisplayDate(booking.actualReturnDate) }}<br>
              Missing punches: {{ getNewReturnMissingPunches(booking).join(', ') || 'None' }}<br>
              Competitors entered: {{ booking.competitorsEntered ?? 'Not set' }}
            </div>
            <button @click="openInvoicePreview(booking)" class="btn">Create Invoice</button>
          </div>
          <button @click="startEdit(booking)" class="btn secondary">Edit Booking</button>
          <button @click="confirmDelete(booking)" class="btn danger">Delete Booking</button>
        </li>
      </ul>
      <div v-else>No bookings found.</div>

      <div v-if="showDeleteDialog" class="dialog delete-dialog">
        <h3>Delete Booking</h3>
        <p class="delete-copy">
          Are you sure you want to delete
          <strong>{{ pendingDeleteBooking?.eventName }}</strong>
          ({{ pendingDeleteBooking?.navlightSet }})?
        </p>
        <p class="delete-copy subtle">This action cannot be undone.</p>
        <div class="dialog-actions">
          <button @click="runDelete" class="btn danger">Yes, Delete</button>
          <button @click="cancelDelete" class="btn secondary">Cancel</button>
        </div>
      </div>

      <div v-if="showInvoiceDialog" class="dialog invoice-dialog">
        <h3>Invoice Preview</h3>

        <div v-if="invoicePreviewLoading">Loading invoice preview...</div>
        <div v-else-if="invoicePreviewError" class="error">{{ invoicePreviewError }}</div>
        <div v-else-if="invoicePreview">
          <p><strong>1. Event name:</strong> {{ invoicePreview.eventName }}</p>
          <p><strong>2. Event date:</strong> {{ invoicePreview.eventDateDisplay }}</p>
          <p>
            <strong>3. Usage charge:</strong>
            {{ invoicePreview.competitorsEntered }} × ${{ Number(invoicePreview.unitCharge).toFixed(2) }}
            = ${{ Number(invoicePreview.usageCharge).toFixed(2) }}
          </p>
          <p>
            <strong>4. Missing returned punches:</strong>
            {{ invoicePreview.newMissingPunches.length }} × $200.00
            = ${{ Number(invoicePreview.missingPunchCharge).toFixed(2) }}
          </p>
          <p><strong>Missing punches list:</strong> {{ invoicePreview.newMissingPunches.join(', ') || 'None' }}</p>
          <p><strong>5. Total charge:</strong> ${{ Number(invoicePreview.totalCharge).toFixed(2) }}</p>
          <p>
            <strong>6. Payment instructions:</strong>
            Pay to bank account {{ invoicePreview.bankAccountNumber || 'Not configured' }}
            with reference "{{ invoicePreview.paymentReference }}".
          </p>
        </div>

        <div class="dialog-actions">
          <button @click="downloadInvoicePdfFromPreview" class="btn secondary" :disabled="invoicePreviewLoading || !invoicePreview">Download PDF</button>
          <button @click="sendInvoiceFromPreview" class="btn" :disabled="invoicePreviewLoading || !invoicePreview">Send Invoice Email</button>
          <button @click="closeInvoicePreview" class="btn secondary">Cancel</button>
        </div>
      </div>

      <div v-if="showEditDialog" class="dialog edit-dialog">
        <h3>Edit Booking</h3>

        <label>Name</label>
        <input v-model="editForm.name" />

        <label>Email</label>
        <input v-model="editForm.email" type="email" />

        <label>Navlight Event Name</label>
        <input v-model="editForm.eventName" />

        <label>Navlight Set</label>
        <select v-model="editForm.navlightSet">
          <option value="Set1">Set 1</option>
          <option value="Set2">Set 2</option>
        </select>

        <label>Pickup Date</label>
        <input v-model="editForm.pickupDate" type="date" />
        <div class="date-preview" v-if="editForm.pickupDate">Display format: {{ formatDisplayDate(editForm.pickupDate) }}</div>

        <label>Event Date</label>
        <input v-model="editForm.eventDate" type="date" />
        <div class="date-preview" v-if="editForm.eventDate">Display format: {{ formatDisplayDate(editForm.eventDate) }}</div>

        <label>Return Date</label>
        <input v-model="editForm.returnDate" type="date" />
        <div class="date-preview" v-if="editForm.returnDate">Display format: {{ formatDisplayDate(editForm.returnDate) }}</div>

        <label>Status</label>
        <select v-model="editForm.status">
          <option value="booked">booked</option>
          <option value="pickedup">pickedup</option>
          <option value="returned">returned</option>
        </select>

        <label>Actual Pickup Date</label>
        <input v-model="editForm.actualPickupDate" type="date" />
        <div class="date-preview" v-if="editForm.actualPickupDate">Display format: {{ formatDisplayDate(editForm.actualPickupDate) }}</div>

        <label>Pickup Missing Punches (comma separated)</label>
        <input v-model="editForm.pickupMissingPunchesInput" placeholder="e.g. 45,64" />

        <label>Actual Return Date</label>
        <input v-model="editForm.actualReturnDate" type="date" />
        <div class="date-preview" v-if="editForm.actualReturnDate">Display format: {{ formatDisplayDate(editForm.actualReturnDate) }}</div>

        <label>Return Missing Punches (comma separated)</label>
        <input v-model="editForm.returnMissingPunchesInput" placeholder="e.g. 45,64" />

        <label>Competitors Entered</label>
        <input type="number" min="0" step="1" v-model="editForm.competitorsEntered" placeholder="e.g. 120" />

        <div v-if="editError" class="error">{{ editError }}</div>
        <div class="dialog-actions">
          <button @click="saveEdit" class="btn">Save</button>
          <button @click="cancelEdit" class="btn secondary">Cancel</button>
        </div>
      </div>

      <!-- Pickup Dialog -->
      <div v-if="showPickupDialog" class="dialog">
        <h3>Mark as Picked Up</h3>
        <label>Date of Pickup</label>
        <input type="date" v-model="pickupDate" />
        <div class="date-preview" v-if="pickupDate">Display format: {{ formatDisplayDate(pickupDate) }}</div>
        <label>Missing Punch Numbers (comma separated)
          <input v-model="pickupMissingPunches" placeholder="e.g. 101,102" />
        </label>
        <div class="dialog-actions">
          <button @click="confirmPickup" class="btn">Confirm</button>
          <button @click="cancelDialog" class="btn secondary">Cancel</button>
        </div>
      </div>

      <!-- Return Dialog -->
      <div v-if="showReturnDialog" class="dialog">
        <h3>Mark as Returned</h3>
        <label>Date of Return</label>
        <input type="date" v-model="returnDate" />
        <div class="date-preview" v-if="returnDate">Display format: {{ formatDisplayDate(returnDate) }}</div>
        <label>Number of Competitors Entered</label>
        <input type="number" min="0" step="1" v-model="competitorsEntered" placeholder="e.g. 120" />
        <label>Missing Punch Numbers (comma separated)
          <input v-model="returnMissingPunches" placeholder="e.g. 101,102" />
        </label>
        <div class="dialog-actions">
          <button @click="confirmReturn" class="btn">Confirm</button>
          <button @click="cancelDialog" class="btn secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchBookings, updateBooking, deleteBooking as apiDeleteBooking, adminLogin, sendInvoice, fetchInvoicePreview, fetchInvoicePdf } from '../api/bookings.js'
import { formatDisplayDate } from '../utils/dateFormat.js'

const emit = defineEmits(['bookings-updated'])

const bookings = ref([])
const showPickupDialog = ref(false)
const showReturnDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showInvoiceDialog = ref(false)
const pickupDate = ref('')
const pickupMissingPunches = ref('')
const returnDate = ref('')
const returnMissingPunches = ref('')
const competitorsEntered = ref('')
const editError = ref('')
const editForm = ref({
  id: null,
  name: '',
  email: '',
  eventName: '',
  navlightSet: 'Set1',
  pickupDate: '',
  eventDate: '',
  returnDate: '',
  status: 'booked',
  actualPickupDate: '',
  pickupMissingPunchesInput: '',
  actualReturnDate: '',
  returnMissingPunchesInput: '',
  competitorsEntered: '',
})
let currentBooking = null
const pendingDeleteBooking = ref(null)

const adminPassword = ref('')
const adminToken = ref(localStorage.getItem('adminToken') || '')
const loginError = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const invoicePreview = ref(null)
const invoicePreviewError = ref('')
const invoicePreviewLoading = ref(false)
const pendingInvoiceBooking = ref(null)

function normalizeStatus(status) {
  if (!status) return 'booked'
  return status.toLowerCase() === 'confirmed' ? 'booked' : status.toLowerCase()
}

function isBookedStatus(status) {
  const normalized = normalizeStatus(status)
  return normalized === 'booked'
}

function getNewReturnMissingPunches(booking) {
  const pickupMissing = Array.isArray(booking?.pickupMissingPunches)
    ? booking.pickupMissingPunches.map(String)
    : []
  const returnMissing = Array.isArray(booking?.returnMissingPunches)
    ? booking.returnMissingPunches.map(String)
    : []

  return returnMissing.filter((punch) => !pickupMissing.includes(punch))
}

async function login() {
  loginError.value = ''
  try {
    const { token } = await adminLogin(adminPassword.value)
    adminToken.value = token
    localStorage.setItem('adminToken', token)
    await loadBookings()
  } catch (e) {
    loginError.value = e.message || 'Login failed'
  }
}

async function loadBookings() {
  bookings.value = await fetchBookings()
}

function handleAdminError(error, fallbackMessage) {
  const message = error?.message || fallbackMessage
  if (message.toLowerCase().includes('unauthorized')) {
    adminToken.value = ''
    localStorage.removeItem('adminToken')
    bookings.value = []
    actionError.value = 'Your admin session expired. Please log in again.'
    return
  }
  actionError.value = message
}

function clearActionMessages() {
  actionError.value = ''
  actionSuccess.value = ''
}

onMounted(() => {
  if (adminToken.value) loadBookings()
})

function startPickup(booking) {
  currentBooking = booking
  pickupDate.value = booking.pickupDate || ''
  pickupMissingPunches.value = ''
  showPickupDialog.value = true
}
function startReturn(booking) {
  currentBooking = booking
  returnDate.value = booking.returnDate || ''
  competitorsEntered.value = booking.competitorsEntered != null ? String(booking.competitorsEntered) : ''
  returnMissingPunches.value = Array.isArray(booking.pickupMissingPunches)
    ? booking.pickupMissingPunches.join(', ')
    : ''
  showReturnDialog.value = true
}

function startEdit(booking) {
  editError.value = ''
  editForm.value = {
    id: booking.id,
    name: booking.name || '',
    email: booking.email || '',
    eventName: booking.eventName || '',
    navlightSet: booking.navlightSet || 'Set1',
    pickupDate: booking.pickupDate || '',
    eventDate: booking.eventDate || '',
    returnDate: booking.returnDate || '',
    status: normalizeStatus(booking.status),
    actualPickupDate: booking.actualPickupDate || '',
    pickupMissingPunchesInput: Array.isArray(booking.pickupMissingPunches) ? booking.pickupMissingPunches.join(', ') : '',
    actualReturnDate: booking.actualReturnDate || '',
    returnMissingPunchesInput: Array.isArray(booking.returnMissingPunches) ? booking.returnMissingPunches.join(', ') : '',
    competitorsEntered: booking.competitorsEntered != null ? String(booking.competitorsEntered) : '',
  }
  showEditDialog.value = true
}

function cancelEdit() {
  showEditDialog.value = false
  editError.value = ''
}

async function saveEdit() {
  editError.value = ''
  clearActionMessages()
  if (!editForm.value.id) return

  try {
    await updateBooking(editForm.value.id, {
      name: editForm.value.name,
      email: editForm.value.email,
      eventName: editForm.value.eventName,
      navlightSet: editForm.value.navlightSet,
      pickupDate: editForm.value.pickupDate,
      eventDate: editForm.value.eventDate,
      returnDate: editForm.value.returnDate,
      status: editForm.value.status,
      actualPickupDate: editForm.value.actualPickupDate || undefined,
      pickupMissingPunches: editForm.value.pickupMissingPunchesInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      actualReturnDate: editForm.value.actualReturnDate || undefined,
      returnMissingPunches: editForm.value.returnMissingPunchesInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      competitorsEntered: editForm.value.competitorsEntered === '' ? undefined : Number(editForm.value.competitorsEntered),
    }, adminToken.value)

    await loadBookings()
    emit('bookings-updated')
    showEditDialog.value = false
  } catch (e) {
    const message = e?.message || 'Failed to update booking.'
    editError.value = message
    handleAdminError(e, 'Failed to update booking.')
  }
}

function cancelDialog() {
  showPickupDialog.value = false
  showReturnDialog.value = false
  currentBooking = null
}
async function confirmPickup() {
  if (!currentBooking) return
  clearActionMessages()
  try {
    await updateBooking(currentBooking.id, {
      status: 'pickedup',
      actualPickupDate: pickupDate.value,
      pickupMissingPunches: pickupMissingPunches.value.split(',').map(s => s.trim()).filter(Boolean),
    }, adminToken.value)
    await loadBookings()
    emit('bookings-updated')
    showPickupDialog.value = false
    currentBooking = null
  } catch (e) {
    handleAdminError(e, 'Failed to update pickup status.')
  }
}
async function confirmReturn() {
  if (!currentBooking) return
  clearActionMessages()
  try {
    await updateBooking(currentBooking.id, {
      status: 'returned',
      actualReturnDate: returnDate.value,
      competitorsEntered: competitorsEntered.value === '' ? undefined : Number(competitorsEntered.value),
      returnMissingPunches: returnMissingPunches.value.split(',').map(s => s.trim()).filter(Boolean),
    }, adminToken.value)
    await loadBookings()
    emit('bookings-updated')
    showReturnDialog.value = false
    currentBooking = null
  } catch (e) {
    handleAdminError(e, 'Failed to update return status.')
  }
}

function confirmDelete(booking) {
  pendingDeleteBooking.value = booking
  showDeleteDialog.value = true
}

function cancelDelete() {
  showDeleteDialog.value = false
  pendingDeleteBooking.value = null
}

async function runDelete() {
  if (!pendingDeleteBooking.value) return
  clearActionMessages()
  try {
    await apiDeleteBooking(pendingDeleteBooking.value.id, adminToken.value)
    await loadBookings()
    emit('bookings-updated')
    showDeleteDialog.value = false
    pendingDeleteBooking.value = null
  } catch (e) {
    handleAdminError(e, 'Failed to delete booking.')
  }
}

async function openInvoicePreview(booking) {
  clearActionMessages()
  invoicePreviewError.value = ''
  invoicePreview.value = null
  pendingInvoiceBooking.value = booking
  showInvoiceDialog.value = true
  invoicePreviewLoading.value = true

  try {
    const data = await fetchInvoicePreview(booking.id, adminToken.value)
    invoicePreview.value = data.invoice
  } catch (e) {
    invoicePreviewError.value = e?.message || 'Failed to load invoice preview.'
  } finally {
    invoicePreviewLoading.value = false
  }
}

function closeInvoicePreview() {
  showInvoiceDialog.value = false
  invoicePreview.value = null
  invoicePreviewError.value = ''
  invoicePreviewLoading.value = false
  pendingInvoiceBooking.value = null
}

async function sendInvoiceFromPreview() {
  if (!pendingInvoiceBooking.value) return

  clearActionMessages()
  try {
    await sendInvoice(pendingInvoiceBooking.value.id, adminToken.value)
    actionSuccess.value = `Invoice sent to ${pendingInvoiceBooking.value.email}`
    await loadBookings()
    emit('bookings-updated')
    closeInvoicePreview()
  } catch (e) {
    handleAdminError(e, 'Failed to create invoice.')
  }
}

async function downloadInvoicePdfFromPreview() {
  if (!pendingInvoiceBooking.value) return

  clearActionMessages()
  try {
    const blob = await fetchInvoicePdf(pendingInvoiceBooking.value.id, adminToken.value)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeEventName = String(pendingInvoiceBooking.value.eventName || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '_')
    link.href = url
    link.download = `invoice-${safeEventName}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (e) {
    handleAdminError(e, 'Failed to download invoice PDF.')
  }
}
</script>

<style scoped>
.admin-wrap h2 {
  margin: 0 0 14px;
  color: #1f2a44;
}

.admin-booking {
  border: 1px solid #e3e8f2;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  background: #fbfcff;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

input {
  border: 1px solid #d3dce8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #ffffff;
}

select {
  border: 1px solid #d3dce8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #ffffff;
}

select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
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

.btn.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.btn.secondary:hover {
  background: #cfd8e4;
}

.btn.danger {
  background: #c62828;
  margin-top: 8px;
}

.btn.danger:hover {
  background: #ab1f1f;
}

.dialog {
  position: fixed;
  top: 28%;
  left: 50%;
  transform: translate(-50%, -28%);
  background: #fff;
  border: 1px solid #d8e0ed;
  border-radius: 12px;
  padding: 24px;
  z-index: 1000;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.2);
  min-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-dialog {
  max-height: 80vh;
  overflow-y: auto;
  min-width: 460px;
}

.delete-dialog {
  min-width: 420px;
}

.invoice-dialog {
  min-width: 520px;
  max-width: 620px;
}

.invoice-dialog p {
  margin: 0;
  color: #334155;
}

.delete-copy {
  margin: 0;
  color: #334155;
}

.delete-copy.subtle {
  color: #64748b;
  font-size: 13px;
}

.login-card {
  position: static;
  transform: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  max-width: 420px;
}

.dialog h3 {
  margin: 0 0 4px;
  color: #1e293b;
}

label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.date-preview {
  margin-top: -4px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #475569;
}

.error {
  color: #b42318;
  background: #feeceb;
  border: 1px solid #f7cac7;
  border-radius: 10px;
  padding: 8px 10px;
}

.action-error {
  margin-bottom: 12px;
}
</style>
