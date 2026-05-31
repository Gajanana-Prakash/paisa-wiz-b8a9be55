-- GST Library seed: representative HSN/SAC codes + notifications (CBIC schedule aligned)

-- Chapter 1-5: Live animals, vegetables, food (mostly nil/5%)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('0401', 'Fresh milk and pasteurized milk (excluding UHT)', '04', 'Dairy produce; birds'' eggs; natural honey', 0, 0, 0, 0, 'Nil rated under Schedule I'),
('0402', 'Milk and cream, concentrated or sweetened', '04', 'Dairy produce; birds'' eggs; natural honey', 2.5, 2.5, 5, 0, NULL),
('0701', 'Potatoes, fresh or chilled', '07', 'Edible vegetables', 0, 0, 0, 0, 'Nil rated'),
('0703', 'Onions and shallots, fresh or chilled', '07', 'Edible vegetables', 0, 0, 0, 0, NULL),
('1001', 'Wheat and meslin', '10', 'Cereals', 0, 0, 0, 0, 'Nil rated'),
('1006', 'Rice', '10', 'Cereals', 0, 0, 0, 0, 'Nil rated (non-brand)'),
('1905', 'Bread, pastry, cakes, biscuits (plain bread nil)', '19', 'Preparations of cereals', 2.5, 2.5, 5, 0, 'Bread generally nil; biscuits 5%'),
('2106', 'Food preparations not elsewhere specified', '21', 'Miscellaneous edible preparations', 2.5, 2.5, 5, 0, 'Packaged foods often 5%'),
('2201', 'Waters, including natural or artificial mineral waters', '22', 'Beverages', 2.5, 2.5, 5, 0, NULL),
('2202', 'Waters, sweetened or flavoured; soft drinks', '22', 'Beverages', 14, 14, 28, 12, 'Cess may apply on aerated drinks');

-- Medicines & healthcare
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('3004', 'Medicaments (medicinal products)', '30', 'Pharmaceutical products', 2.5, 2.5, 5, 0, 'Most formulations 5%; some exempt'),
('3006', 'Pharmaceutical goods (bandages, etc.)', '30', 'Pharmaceutical products', 6, 6, 12, 0, NULL),
('9018', 'Instruments for medical, surgical, dental use', '90', 'Optical, medical instruments', 6, 6, 12, 0, NULL);

-- Textiles (Ch 50-63)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('5208', 'Woven fabrics of cotton, containing 85% or more cotton', '52', 'Cotton', 2.5, 2.5, 5, 0, 'Rate revision notified 2025'),
('5209', 'Woven fabrics of cotton, containing less than 85% cotton', '52', 'Cotton', 2.5, 2.5, 5, 0, NULL),
('6109', 'T-shirts, singlets and other vests, knitted', '61', 'Apparel knitted', 2.5, 2.5, 5, 0, 'Garments ≤ ₹1000 per piece'),
('6110', 'Jerseys, pullovers, cardigans, knitted', '61', 'Apparel knitted', 2.5, 2.5, 5, 0, NULL),
('6203', 'Men''s suits, ensembles, jackets, trousers', '62', 'Apparel not knitted', 6, 6, 12, 0, 'Value > ₹1000 per piece often 12%');

-- Chemicals & plastics (25-40)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('2523', 'Portland cement, aluminous cement, slag cement', '25', 'Salt; sulphur; earths; stone', 14, 14, 28, 0, NULL),
('3917', 'Tubes, pipes and hoses, of plastics', '39', 'Plastics', 9, 9, 18, 0, NULL),
('3923', 'Articles for conveyance or packing, of plastics', '39', 'Plastics', 9, 9, 18, 0, 'Packaging materials');

-- Electronics (84-85)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('8471', 'Automatic data processing machines (computers)', '84', 'Machinery', 9, 9, 18, 0, 'Laptops, desktops'),
('84713010', 'Portable automatic data processing machines, weighing ≤ 10 kg', '84', 'Machinery', 9, 9, 18, 0, 'Laptops — 8 digit'),
('8517', 'Telephone sets; smartphones', '85', 'Electrical machinery', 9, 9, 18, 0, 'Mobile phones'),
('8528', 'Monitors and projectors; television reception apparatus', '85', 'Electrical machinery', 9, 9, 18, 0, NULL);

-- Vehicles (87)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('8703', 'Motor cars and vehicles for transport of persons', '87', 'Vehicles', 14, 14, 28, 15, 'Compensation cess on motor vehicles'),
('8711', 'Motorcycles and cycles fitted with motor', '87', 'Vehicles', 14, 14, 28, 0, NULL);

-- Jewellery & footwear
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('7113', 'Articles of jewellery of precious metal', '71', 'Natural/cultured pearls, precious stones', 1.5, 1.5, 3, 0, 'Gold jewellery — 3% GST'),
('6403', 'Footwear with outer soles of rubber/plastic', '64', 'Footwear', 2.5, 2.5, 5, 0, 'Value ≤ ₹1000 per pair'),
('6404', 'Footwear with outer soles of rubber/plastic (higher value)', '64', 'Footwear', 6, 6, 12, 0, NULL);

-- Construction materials
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, cess_rate, notes) VALUES
('6810', 'Articles of cement, concrete or artificial stone', '68', 'Stone, plaster, cement', 14, 14, 28, 0, NULL),
('7214', 'Bars and rods of iron or non-alloy steel', '72', 'Iron and steel', 9, 9, 18, 0, 'TMT bars');

-- Historical rate row (example)
INSERT INTO public.hsn_master (hsn_code, description, chapter, chapter_description, cgst_rate, sgst_rate, igst_rate, effective_from, effective_to, is_current, notes) VALUES
('0401', 'Fresh milk and cream (historical)', '04', 'Dairy produce', 2.5, 2.5, 5, '2017-07-01', '2019-09-30', false, 'Superseded — refer Notification 19/2019');

-- SAC services (Chapter 99)
INSERT INTO public.sac_master (sac_code, service_description, cgst_rate, sgst_rate, igst_rate, exemption_condition) VALUES
('998211', 'Legal services', 9, 9, 18, NULL),
('998212', 'Arbitration and conciliation services', 9, 9, 18, NULL),
('998221', 'Accounting, bookkeeping and auditing services', 9, 9, 18, 'CA professional services'),
('998231', 'Tax consultancy and preparation services', 9, 9, 18, 'GST return filing, tax advisory'),
('998232', 'Business and management consultancy', 9, 9, 18, NULL),
('998311', 'Management consultancy services', 9, 9, 18, NULL),
('998312', 'Financial consultancy services', 9, 9, 18, NULL),
('998313', 'Information technology (IT) consultancy', 9, 9, 18, 'Software development consultancy'),
('998314', 'Software development services', 9, 9, 18, 'Custom software'),
('998315', 'Hosting and information technology services', 9, 9, 18, 'SaaS, cloud hosting'),
('998316', 'Data processing and database services', 9, 9, 18, NULL),
('998331', 'Architectural services', 9, 9, 18, NULL),
('998332', 'Engineering services', 9, 9, 18, NULL),
('998333', 'Scientific and technical consulting', 9, 9, 18, NULL),
('998511', 'Advertising services', 9, 9, 18, NULL),
('998512', 'Market research and public opinion polling', 9, 9, 18, NULL),
('998513', 'Photography services', 9, 9, 18, NULL),
('998514', 'Event management services', 9, 9, 18, NULL),
('998551', 'Restaurant services (with facilities)', 2.5, 2.5, 5, 'AC restaurant — 5%; takeaway may differ'),
('998552', 'Restaurant services (without AC)', 2.5, 2.5, 5, NULL),
('998559', 'Other food, beverage serving services', 2.5, 2.5, 5, 'Cloud kitchen, catering'),
('998601', 'Renting of transport vehicles with operator', 2.5, 2.5, 5, NULL),
('998713', 'Maintenance and repair services', 9, 9, 18, NULL),
('998714', 'Cleaning services', 9, 9, 18, NULL),
('998717', 'Real estate services involving owned/leased property', 2.5, 2.5, 5, 'Commercial rent'),
('998721', 'Real estate services on fee/commission basis', 9, 9, 18, NULL),
('999799', 'Other services not elsewhere classified', 9, 9, 18, NULL);

-- GST notifications (last 24 months — major)
ALTER TABLE public.gst_notifications DISABLE TRIGGER trg_gst_notification_notify;

INSERT INTO public.gst_notifications (
  notification_number, title, summary, full_summary, effective_date, category,
  affected_hsn_codes, full_text_url, impact_level
) VALUES
(
  'Notification No. 21/2025 – Central Tax (Rate)',
  'Rate changed on 12 items',
  'GST rates revised on textiles, electronics, and packaged food. Review client invoices for affected HSN codes.',
  'The Central Board of Indirect Taxes has notified changes to GST rates on select textile fabrics (HSN 5208), automatic data processing machines (8471), and food preparations (2106). Rates are effective from the notified date. CA firms should update billing templates and verify client purchase registers for the transition period.',
  '2025-11-14',
  'RATE_CHANGE',
  ARRAY['5208', '8471', '2106'],
  'https://cbic-gst.gov.in/gst-goods-services-rates.html',
  'HIGH'
),
(
  'Notification No. 14/2025 – Central Tax',
  'GSTR-3B filing extension for October 2025',
  'Deadline extended by 3 days for specified states due to technical issues on the GST portal.',
  'Taxpayers in notified states may file GSTR-3B for October 2025 without late fee if filed by the extended due date. Interest provisions apply as per law for delayed payment of tax.',
  '2025-11-20',
  'DEADLINE_EXTENSION',
  NULL,
  'https://www.gst.gov.in/newsandupdates',
  'HIGH'
),
(
  'Notification No. 09/2025 – Central Tax (Rate)',
  'Exemption for certain healthcare services',
  'Specified diagnostic services exempt when provided by registered clinical establishments.',
  'Healthcare exemptions under GST require documentation of eligibility. CAs should verify SAC codes on invoices from hospital clients.',
  '2025-08-01',
  'EXEMPTION',
  ARRAY['9993'],
  'https://cbic-gst.gov.in/',
  'MEDIUM'
),
(
  'Notification No. 04/2025 – Central Tax',
  'Amendment to GSTR-1 Table 12 reporting',
  'Additional validation for e-invoice IRN matching in GSTR-1.',
  'GSTN has enhanced validation between e-invoice data and GSTR-1. Mismatches may trigger notices — reconcile before filing.',
  '2025-05-15',
  'PROCEDURE',
  NULL,
  'https://www.gst.gov.in/',
  'MEDIUM'
),
(
  'Notification No. 52/2024 – Central Tax (Rate)',
  'GST on imitation jewellery rationalised',
  'Imitation jewellery HSN 7117 moved to 3% slab.',
  'Rate change affects retailers and wholesalers. Update POS and accounting masters.',
  '2024-10-01',
  'RATE_CHANGE',
  ARRAY['7117'],
  'https://cbic-gst.gov.in/',
  'LOW'
),
(
  'Notification No. 38/2024 – Central Tax',
  'Due date extension for annual return GSTR-9',
  'FY 2023-24 GSTR-9 due date extended to 30 November 2024.',
  'Applicable to all regular taxpayers unless specifically excluded.',
  '2024-09-30',
  'DEADLINE_EXTENSION',
  NULL,
  'https://www.gst.gov.in/',
  'HIGH'
),
(
  'Notification No. 22/2024 – Central Tax (Rate)',
  'Rate on solar power generating systems',
  'Solar modules and related goods — concessional rate continued.',
  'Supports renewable energy sector. Verify HSN classification on EPC contracts.',
  '2024-07-15',
  'RATE_CHANGE',
  ARRAY['8541', '8501'],
  'https://cbic-gst.gov.in/',
  'MEDIUM'
),
(
  'Notification No. 11/2024 – Central Tax',
  'New FORM GSTR-1A for amendments',
  'Introduced form for post-filing amendments to outward supplies.',
  'Taxpayers may use GSTR-1A within prescribed window. Update firm SOPs for client filings.',
  '2024-04-01',
  'FORM',
  NULL,
  'https://www.gst.gov.in/',
  'MEDIUM'
),
(
  'Notification No. 03/2024 – Central Tax (Rate)',
  'Cess on motor vehicles updated',
  'Compensation cess rates on specified motor vehicles revised.',
  'Affects automobile dealers. Check HSN 8703 invoices for cess column.',
  '2024-02-01',
  'RATE_CHANGE',
  ARRAY['8703'],
  'https://cbic-gst.gov.in/',
  'HIGH'
),
(
  'Notification No. 49/2023 – Central Tax',
  'E-invoicing threshold reduced to ₹5 crore',
  'Mandatory e-invoicing for businesses with turnover above ₹5 crore.',
  'Clients crossing threshold must register on IRP. CAs should enable e-invoice workflow in GSTify.',
  '2023-08-01',
  'PROCEDURE',
  NULL,
  'https://einvoice1.gst.gov.in/',
  'HIGH'
);

ALTER TABLE public.gst_notifications ENABLE TRIGGER trg_gst_notification_notify;
