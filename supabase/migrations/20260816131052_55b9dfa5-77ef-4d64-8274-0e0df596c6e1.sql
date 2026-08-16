-- Arkivera rökta produkter
update products set active = false, updated_at = now()
where sku in ('RÖ-014','RÖ-013','RÖ-018','RÖ-015','RÖ-003')
   or parent_product_id in (select id from products where sku in ('RÖ-014','RÖ-013','RÖ-018','RÖ-015','RÖ-003'));

-- Bilder
update products set image_url = 'https://jhb.se/storage/6096E5903D695BA3C10667CC17702FA44713B804D05AE6B5160BB4B7B12C9ADC/02518169fe8c4ceaa73745ae12289b93/png/media/61d28dc3055b4d03807d81da827cf8ce/61409_Lax%20varmr%C3%B6kt%20Hulda%20bitar%20ca%20200gr%20citron%20Savolax.png', updated_at = now()
where sku in ('KK-033','KK-034') or parent_product_id in (select id from products where sku in ('KK-033','KK-034'));

update products set image_url = 'https://jhb.se/storage/0C0C86AF56393517A6D0E0A6220F54018DA041D8DF44A116580D50254CFD43BE/d9d1ec6727a14eb39357f69bd87483c4/500-500-0-png.Png/media/8d6bc57b685d429bba4b9d48fe79f96f/61413_Lax%20nuggets%20naturell%20Savolax.png', updated_at = now()
where sku = 'RÖ-020' or parent_product_id in (select id from products where sku = 'RÖ-020');

update products set image_url = 'https://images.mealwhizz.com/products/sv-SE/thumbs/300/11811.jpg', updated_at = now()
where sku = 'SK-032' or parent_product_id in (select id from products where sku = 'SK-032');