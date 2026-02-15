<template>
  <div>
    <h2>Current Navlight Bookings</h2>
    <ul v-if="bookings.length">
      <li v-for="booking in bookings" :key="booking.id">
        <strong>{{ booking.eventName }}</strong> ({{ booking.navlightSet }})<br>
        Name: {{ booking.name }}<br>
        Email: {{ booking.email }}<br>
        Pickup: {{ booking.pickupDate }} | Event: {{ booking.eventDate }} | Return: {{ booking.returnDate }}
      </li>
    </ul>
    <div v-else>No bookings found.</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchBookings } from '../api/bookings.js'

const bookings = ref([])
const error = ref('')

async function loadBookings() {
  try {
    bookings.value = await fetchBookings()
    error.value = ''
  } catch (e) {
    error.value = e.message || 'Failed to load bookings.'
  }
}

onMounted(loadBookings)

defineExpose({ loadBookings })
</script>

<style scoped>
ul {
  list-style: none;
  padding: 0;
}
li {
  margin-bottom: 20px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 10px;
}
</style>
