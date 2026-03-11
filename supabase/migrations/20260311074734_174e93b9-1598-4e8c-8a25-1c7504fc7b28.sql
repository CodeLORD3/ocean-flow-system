INSERT INTO storage_locations (name, zone, description) 
VALUES ('Transportlager', 'Transport', 'Varor i transit från grossist till butik')
ON CONFLICT DO NOTHING;