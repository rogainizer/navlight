<template>
  <form class="booking-form" @submit.prevent="submitBooking">
    <h2>Book Navlight Set</h2>

    <div class="field">
      <label for="name">Name</label>
      <input id="name" v-model="form.name" required />
    </div>

    <div class="field">
      <label for="email">Email</label>
      <input id="email" v-model="form.email" type="email" required />
    </div>

    <div class="field">
      <label for="eventName">Navlight Event Name</label>
      <input id="eventName" v-model="form.eventName" required />
    </div>

    <div class="date-grid">
      <div class="field">
        <label for="pickupDate">Pickup Date</label>
        <input id="pickupDate" v-model="form.pickupDate" type="date" required />
      </div>

      <div class="field">
        <label for="eventDate">Event Date</label>
        <input id="eventDate" v-model="form.eventDate" type="date" required />
      </div>

      <div class="field">
        <label for="returnDate">Return Date</label>
        <input id="returnDate" v-model="form.returnDate" type="date" required />
      </div>
    </div>

    <div class="field">
      <label for="navlightSet">Navlight Set</label>
      <select id="navlightSet" v-model="form.navlightSet" required>
        <option value="Set1">Set 1</option>
        <option value="Set2">Set 2</option>
      </select>
    </div>

    <div class="field">
      <label for="comment">Comment</label>
      <input id="comment" v-model="form.comment" placeholder="Optional comment" />
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <button type="submit">Submit Booking</button>
  </form>
</template>

<script setup>
import { ref, defineEmits } from 'vue'
import { createBooking } from '../api/bookings.js'

const emit = defineEmits(['booking-success'])

const form = ref({
  name: '',
  email: '',
  eventName: '',
  pickupDate: '',
  eventDate: '',
  returnDate: '',
  navlightSet: '',
  comment: '',
})

const error = ref('')
const success = ref('')

function validateDates() {
  if (!form.value.pickupDate || !form.value.eventDate || !form.value.returnDate) return false
  return (
    form.value.pickupDate <= form.value.eventDate &&
    form.value.eventDate <= form.value.returnDate
  )
}

async function submitBooking() {
  error.value = ''
  success.value = ''
  if (!validateDates()) {
    error.value = 'Dates must be in order: Pickup ≤ Event ≤ Return.'
    return
  }
  try {
    await createBooking({ ...form.value })
    success.value = 'Booking submitted!'
    emit('booking-success')
    // Optionally, reset form
    form.value = {
      name: '',
      email: '',
      eventName: '',
      pickupDate: '',
      eventDate: '',
      returnDate: '',
      navlightSet: '',
      comment: '',
    }
  } catch (e) {
    error.value = e.message || 'Failed to submit booking.'
  }
}
</script>

<style scoped>
.booking-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}

h2 {
  margin: 0 0 8px;
  color: #1f2a44;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

input,
select {
  border: 1px solid #d3dce8;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #ffffff;
}

input:focus,
select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
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
  background: #e8f7ed;
  border: 1px solid #b8e6c2;
  border-radius: 10px;
  padding: 8px 10px;
}

button {
  align-self: flex-start;
  border: none;
  border-radius: 10px;
  background: #1d4ed8;
  color: #ffffff;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: #1b45bf;
}

@media (max-width: 820px) {
  .date-grid {
    grid-template-columns: 1fr;
  }
}
</style>
