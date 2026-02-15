
<template>
  <div class="menu">
    <button @click="view = 'calendar'">View Calendar</button>
    <button @click="view = 'booking'">Book Navlight</button>
    <button @click="view = 'admin'">Admin</button>
  </div>
  <div v-if="view === 'calendar'">
    <BookingCalendar :bookings="bookings" />
  </div>
  <div v-else-if="view === 'booking'">
    <BookingForm @booking-success="refreshBookings" />
  </div>
  <div v-else-if="view === 'admin'">
    <AdminPanel />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BookingForm from '../components/BookingForm.vue'
import BookingCalendar from '../components/BookingCalendar.vue'
import AdminPanel from '../components/AdminPanel.vue'
import { fetchBookings } from '../api/bookings.js'

const view = ref('calendar')
const bookings = ref([])

async function refreshBookings() {
  bookings.value = await fetchBookings()
  view.value = 'calendar'
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
