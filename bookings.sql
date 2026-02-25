-- Seed existing bookings from bookings.json into the MySQL table.
-- Run `mysql -u navlight -p navlight < db-seed.sql` (adjust credentials as needed).

USE navlight;
START TRANSACTION;

INSERT INTO bookings (id, navlight_set, pickup_date, event_date, return_date, status, data)
VALUES
  (
    1771272024208,
    'Set1',
    '2026-03-16',
    '2026-03-29',
    '2026-04-05',
    'booked',
    '{"id":1771272024208,"navlightSet":"Set1","pickupDate":"2026-03-16","eventDate":"2026-03-29","returnDate":"2026-04-05","name":"Milan Brodina","email":"milanbrodina@gmail.com","eventName":"Geraldine Adventure Race","status":"booked","comment":"Need approx 30 punches","returnedLostPunches":[]}'
  ),
  (
    1771274056361,
    'Set1',
    '2026-06-01',
    '2026-06-13',
    '2026-06-21',
    'booked',
    '{"id":1771274056361,"navlightSet":"Set1","pickupDate":"2026-06-01","eventDate":"2026-06-13","returnDate":"2026-06-21","name":"Graeme Read","email":"gr.read@gmail.com","eventName":"HOW","status":"booked","comment":"","returnedLostPunches":[]}'
  ),
  (
    1771626742232,
    'Set2',
    '2026-03-27',
    '2026-04-11',
    '2026-04-27',
    'booked',
    '{"id":1771626742232,"navlightSet":"Set2","pickupDate":"2026-03-27","eventDate":"2026-04-11","returnDate":"2026-04-27","name":"Tim Farrant","email":"rogainespecialist@gmail.com","eventName":"Kaikoura Adventure Race","status":"booked","comment":"","returnedLostPunches":[]}'
  )
ON DUPLICATE KEY UPDATE
  navlight_set = VALUES(navlight_set),
  pickup_date = VALUES(pickup_date),
  event_date = VALUES(event_date),
  return_date = VALUES(return_date),
  status = VALUES(status),
  data = VALUES(data);

COMMIT;
