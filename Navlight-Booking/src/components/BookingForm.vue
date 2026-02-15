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
import { ref } from 'vue'

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

function validateDates() {
  if (!form.value.pickupDate || !form.value.eventDate || !form.value.returnDate) return false
  return (
    form.value.pickupDate <= form.value.eventDate &&
    form.value.eventDate <= form.value.returnDate
  )
}

function submitBooking() {
  error.value = ''
  if (!validateDates()) {
    error.value = 'Dates must be in order: Pickup ≤ Event ≤ Return.'
    return
  }
  // TODO: Add API call to submit booking
  alert('Booking submitted!')
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
