<template>
  <div class="calendar">
    <h2>Navlight Bookings Calendar (Next 12 Months)</h2>
    <p class="subtitle">Bookings are grouped by month and include active date ranges.</p>
    <div class="months">
      <div v-for="month in months" :key="month.key" class="month">
        <h3>{{ month.label }}</h3>
        <ul class="booking-list">
          <li v-for="booking in month.bookings" :key="booking.id" class="booking-item">
            <div class="booking-top">
              <strong>{{ booking.eventName }}</strong>
              <span class="set-chip">{{ booking.navlightSet }}</span>
            </div>
            <div class="booking-dates">{{ formatDisplayDate(booking.pickupDate) }} → {{ formatDisplayDate(booking.returnDate) }}</div>
            <div class="booking-name">Name: {{ booking.name }}</div>
            <div class="booking-status-row">
              <span :class="['status-chip', `status-${normalizeStatus(booking.status)}`]">
                {{ normalizeStatus(booking.status) }}
              </span>
            </div>
          </li>
        </ul>
        <div v-if="month.bookings.length === 0" class="empty">No bookings</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns'
import { formatDisplayDate } from '../utils/dateFormat.js'

const props = defineProps({ bookings: Array })

function normalizeStatus(status) {
  if (!status) return 'booked'
  return status.toLowerCase() === 'confirmed' ? 'booked' : status.toLowerCase()
}

const now = new Date()
const months = computed(() => {
  return Array.from({ length: 12 }).map((_, i) => {
    const start = startOfMonth(addMonths(now, i))
    const end = endOfMonth(addMonths(now, i))
    const label = format(start, 'MMMM yyyy')
    const key = format(start, 'yyyy-MM')
    const bookingsInMonth = (props.bookings || []).filter(b => {
      const pickup = parseISO(b.pickupDate)
      const returnDate = parseISO(b.returnDate)
      return (
        isWithinInterval(pickup, { start, end }) ||
        isWithinInterval(returnDate, { start, end }) ||
        (pickup < start && returnDate > end)
      )
    })
    return { label, key, bookings: bookingsInMonth }
  })
})
</script>

<style scoped>
.calendar {
  margin-top: 4px;
}

h2 {
  margin: 0;
  color: #1f2a44;
}

.subtitle {
  margin: 8px 0 16px;
  color: #64748b;
}

.months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.month {
  border: 1px solid #e3e8f2;
  border-radius: 12px;
  padding: 12px;
  min-height: 140px;
  background: #fbfcff;
}

.month h3 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #334155;
}

.booking-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.booking-item {
  border: 1px solid #e8ecf4;
  background: #ffffff;
  border-radius: 10px;
  padding: 8px;
  font-size: 13px;
}

.booking-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.set-chip {
  background: #e9efff;
  color: #274690;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
}

.booking-dates {
  margin-top: 4px;
  color: #4b5563;
}

.booking-name {
  margin-top: 2px;
  color: #475569;
}

.booking-status-row {
  margin-top: 6px;
}

.status-chip {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  border: 1px solid transparent;
}

.status-booked {
  color: #0f766e;
  background: #e6fffb;
  border-color: #99f6e4;
}

.status-confirmed {
  color: #0f766e;
  background: #e6fffb;
  border-color: #99f6e4;
}

.status-pickedup {
  color: #6d28d9;
  background: #f3e8ff;
  border-color: #d8b4fe;
}

.status-returned {
  color: #166534;
  background: #ecfdf3;
  border-color: #86efac;
}

.empty {
  color: #888;
  font-style: italic;
}
</style>
