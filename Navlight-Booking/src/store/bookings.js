import { ref } from 'vue'

// Simple bookings store (replace with Pinia/Vuex for larger apps)
const bookings = ref([])

function addBooking(booking) {
  bookings.value.push(booking)
}

function getBookings() {
  return bookings.value
}

export default {
  bookings,
  addBooking,
  getBookings,
}
