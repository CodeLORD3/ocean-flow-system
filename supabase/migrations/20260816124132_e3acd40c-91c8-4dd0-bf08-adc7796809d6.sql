update products p set image_url = v.url
from (values
 ('%kallrökt%savolax%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/46213f60-3cc5-11eb-a553-452fe24c6b7e_1.jpg?v=1720539488'),
 ('%varmrökt%savolax%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/68236c10-37f1-11eb-8e48-5d5fef4248b7_2.jpg?v=1720539536'),
 ('gravad lax savolax%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/3f49ff10-3cc5-11eb-a553-452fe24c6b7e_1.jpg?v=1720539370'),
 ('%kippers%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/5020_BOCKLINGFILE.jpg?v=1733152569'),
 ('%oscietra%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/85de8324-24ac-435d-9b33-73eb8b880534_rw_1920.jpg?v=1720522513'),
 ('%signalkräftor%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/617b6a80-f9bf-11eb-be14-435a8ba8c2c7.jpg?v=1721038859'),
 ('matjessillfilé%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/P1055656.jpg?v=1733152406'),
 ('senapssill%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/P1055627-min.jpg?v=1733151405'),
 ('forellrom%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/2a1b53f0-3cc5-11eb-a553-452fe24c6b7e_1.jpg?v=1720522765'),
 ('löksill%','https://cdn.shopify.com/s/files/1/0828/2544/5642/files/MG_0266.jpg?v=1733150737')
) as v(pat,url)
where p.image_url is null and p.active is not false and lower(p.name) ilike v.pat;