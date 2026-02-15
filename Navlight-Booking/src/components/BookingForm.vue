<template>
  <form @submit.prevent="submitBooking">
    <div>
      <label>Name:</label>
      <input v-model="form.name" required />
    </div>
    <div>
      <label>Email:</label>
      <input v-model="form.email" type="email" required />
    </div>
    <div>
      <label>Navlight Event Name:</label>
      <input v-model="form.eventName" required />
    </div>
    <div>
      <label>Pickup Date:</label>
      <input v-model="form.pickupDate" type="date" required />
    </div>
    <div>
      <label>Event Date:</label>
      <input v-model="form.eventDate" type="date" required />
    </div>
    <div>
      <label>Return Date:</label>
      <input v-model="form.returnDate" type="date" required />
    </div>
    <div>
      <label>Navlight Set:</label>
      <select v-model="form.navlightSet" required>
        <option value="Set1">Set 1</option>
        <option value="Set2">Set 2</option>
      </select>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <button type="submit">Book Navlight</button>
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
    }
  } catch (e) {
    error.value = e.message || 'Failed to submit booking.'
  }
}
</script>

<style scoped>
.error {
  color: red;
  margin-top: 10px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}
</style>
