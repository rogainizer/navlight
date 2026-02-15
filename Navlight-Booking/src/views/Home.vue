
<template>
  <div class="menu">
    <button @click="showBookingForm = false">View Calendar</button>
    <button @click="showBookingForm = true">Book Navlight</button>
  </div>
  <div v-if="!showBookingForm">
    <BookingCalendar :bookings="bookings" />
  </div>
  <div v-else>
    <BookingForm @booking-success="refreshBookings" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BookingForm from '../components/BookingForm.vue'
import BookingCalendar from '../components/BookingCalendar.vue'
import { fetchBookings } from '../api/bookings.js'

const showBookingForm = ref(false)
const bookings = ref([])

async function refreshBookings() {
  bookings.value = await fetchBookings()
  showBookingForm.value = false
}

onMounted(refreshBookings)
</script>
<style scoped>
.menu {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
button {
  padding: 8px 16px;
  font-size: 16px;
}
</style>
