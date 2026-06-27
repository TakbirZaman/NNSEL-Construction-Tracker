import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('admin','manager','worker')),
        avatar VARCHAR(10) DEFAULT '👷',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','on_hold')),
        budget NUMERIC(15,2) DEFAULT 0,
        start_date DATE,
        end_date DATE,
        location VARCHAR(255),
        manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','blocked')),
        priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
        progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        due_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS materials (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        unit VARCHAR(50) NOT NULL DEFAULT 'units',
        quantity_ordered NUMERIC(12,2) DEFAULT 0,
        quantity_used NUMERIC(12,2) DEFAULT 0,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        supplier VARCHAR(200),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS budget_entries (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL CHECK (category IN ('labor','materials','equipment','overhead','other')),
        description VARCHAR(255) NOT NULL,
        planned_cost NUMERIC(12,2) DEFAULT 0,
        actual_cost NUMERIC(12,2) DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Database migrations completed');
    await seedData(client);
  } finally {
    client.release();
  }
}

async function seedData(client) {
  const { rows } = await client.query('SELECT COUNT(*) FROM projects');
  if (parseInt(rows[0].count) > 0) return;

  console.log('🌱 Seeding comprehensive demo data...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ── Users (1 admin, 3 managers, 8 workers) ──────────────────────────────
  await client.query(`
    INSERT INTO users (name, email, password, role, avatar) VALUES
    ('System Admin',          'admin@constructtrack.com',    $1, 'admin',   '👑'),
    ('Md. Rafiqul Islam',     'rafiqul@constructtrack.com',  $1, 'manager', '👨‍💼'),
    ('Nasrin Akter',          'nasrin@constructtrack.com',   $1, 'manager', '👩‍💼'),
    ('Engr. Tariq Hossain',  'tariq@constructtrack.com',     $1, 'manager', '🧑‍💼'),
    ('Md. Kamal Hossain',     'kamal@constructtrack.com',    $1, 'worker',  '👷'),
    ('Fatema Begum',          'fatema@constructtrack.com',   $1, 'worker',  '👩‍🔧'),
    ('Md. Shahidul Alam',     'shahidul@constructtrack.com', $1, 'worker',  '🔧'),
    ('Rezaul Karim',          'rezaul@constructtrack.com',   $1, 'worker',  '⚙️'),
    ('Sumaiya Khatun',        'sumaiya@constructtrack.com',  $1, 'worker',  '🧱'),
    ('Abdur Rahim',           'rahim@constructtrack.com',    $1, 'worker',  '🔨'),
    ('Shamima Yesmin',        'shamima@constructtrack.com',  $1, 'worker',  '🪚'),
    ('Jakir Hossain',         'jakir@constructtrack.com',    $1, 'worker',  '🚜')
    ON CONFLICT DO NOTHING
  `, [hashedPassword]);

  // ── Projects (8 total) ──────────────────────────────────────────────────
  await client.query(`
    INSERT INTO projects (name, description, status, budget, start_date, end_date, location, manager_id, created_by) VALUES
    ('Skyline Tower Complex',     'A 45-floor mixed-use development with commercial and residential units, featuring retail spaces, offices, and 200 luxury apartments',           'active',    12500000, '2024-01-15', '2025-12-31', 'Motijheel, Dhaka',       2, 1),
    ('Harbor Bridge Renovation',  'Complete structural renovation of the historic Buriganga harbor bridge including deck replacement, cable tensioning, and seismic retrofitting',  'active',     4800000, '2024-03-01', '2025-06-30', 'Buriganga Riverfront',   3, 1),
    ('Green Valley Residences',   'Eco-friendly residential complex with 120 units, rooftop gardens, solar panels, and rainwater harvesting system',                                 'planning',   6200000, '2024-06-01', '2026-03-31', 'Uttara, Dhaka',          2, 1),
    ('Metro Station Expansion',   'Underground metro station capacity expansion including platform extensions, new ventilation shafts, and accessibility upgrades',                    'completed',  3100000, '2023-06-01', '2024-04-30', 'Agargaon, Dhaka',        3, 1),
    ('Corporate HQ Fitout',       'Interior fit-out for 12-floor corporate headquarters including MEP, finishing, and smart building systems',                                       'on_hold',    1800000, '2024-04-01', '2024-10-31', 'Gulshan-2, Dhaka',       2, 1),
    ('Mirpur Flyover Extension',  'Construction of 3.2km flyover extension with 4 lanes, pedestrian walkways, and stormwater drainage',                                              'active',     8900000, '2024-09-01', '2026-06-30', 'Mirpur Road, Dhaka',     4, 1),
    ('Chattogram Port Warehouse', 'Modern logistics warehouse with 500,000 sq ft storage capacity, cold storage, and automated loading docks',                                       'planning',   7500000, '2025-01-01', '2026-12-31', 'Chattogram Port Area',   4, 1),
    ('Rangpur Medical College',   'Construction of 500-bed teaching hospital with attached medical college building and staff quarters',                                             'active',    15000000, '2024-05-01', '2027-03-31', 'Rangpur Medical City',   3, 1)
    ON CONFLICT DO NOTHING
  `);

  // ── Tasks (35 total) ────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO tasks (project_id, title, description, status, priority, progress, assigned_to, due_date) VALUES
    -- Project 1: Skyline Tower (8 tasks)
    (1, 'Foundation Excavation',          'Complete basement excavation to 18m depth with shoring systems',                     'completed',   'critical', 100, 4,  '2024-03-15'),
    (1, 'Mat Foundation & Waterproofing', 'Pour 2.5m thick mat foundation with waterproof membrane',                           'completed',   'critical', 100, 5,  '2024-05-01'),
    (1, 'Structural Steel Framework',     'Install main structural steel columns and beams floors 1-20',                       'in_progress', 'critical',  65, 4,  '2024-08-30'),
    (1, 'Core Wall Construction',         'Reinforced concrete core walls for elevator shafts and stairwells (floors 1-15)',    'in_progress', 'high',      45, 7,  '2024-09-15'),
    (1, 'Electrical Rough-In',            'Complete primary electrical conduit installation for floors 1-10',                   'in_progress', 'high',      40, 5,  '2024-09-15'),
    (1, 'Plumbing Core Installation',     'Install main plumbing risers and core systems for floors 1-10',                      'pending',     'high',       0, 5,  '2024-10-01'),
    (1, 'Curtain Wall Installation',      'Install glass curtain wall facade system for tower',                                 'pending',     'medium',     0, 6,  '2025-01-15'),
    (1, 'HVAC Ductwork Core',             'Main HVAC ductwork installation in mechanical floors',                                'pending',     'medium',     0, 9,  '2025-02-01'),

    -- Project 2: Harbor Bridge (6 tasks)
    (2, 'Bridge Inspection & Assessment', 'Complete structural assessment of all bridge elements including NDT testing',        'completed',   'critical', 100, 6,  '2024-03-30'),
    (2, 'Scaffolding & Access Setup',     'Erect full-access scaffolding and safety netting system',                            'completed',   'high',     100, 10, '2024-04-15'),
    (2, 'Deck Replacement Phase 1',       'Replace concrete deck panels sections A-D (eastbound lanes)',                        'in_progress', 'critical',  55, 4,  '2024-07-30'),
    (2, 'Deck Replacement Phase 2',       'Replace concrete deck panels sections E-H (westbound lanes)',                        'pending',     'critical',   0, 7,  '2024-10-15'),
    (2, 'Cable Tension Adjustment',       'Recalibrate and tension main suspension cables to design specifications',            'pending',     'high',       0, 5,  '2024-09-01'),
    (2, 'Seismic Retrofitting',           'Install base isolators and shear dampers at critical structural nodes',               'pending',     'high',       0, 11, '2024-12-01'),

    -- Project 3: Green Valley (5 tasks)
    (3, 'Site Survey & Geotechnical',     'Complete topographic survey, soil testing, and geotechnical analysis',                'completed',   'high',     100, 7,  '2024-05-15'),
    (3, 'Permit Applications',            'Submit all required construction permits and environmental clearances',               'in_progress', 'high',      70, 8,  '2024-07-01'),
    (3, 'Architectural Design Finalization', 'Finalize building design with eco-friendly specifications',                        'in_progress', 'medium',    60, 2,  '2024-08-15'),
    (3, 'Tender & Contractor Selection',  'Publish tenders, evaluate bids, and select main contractors',                         'pending',     'medium',     0, 2,  '2024-10-01'),
    (3, 'Site Preparation',               'Clear site, establish perimeter fencing and site offices',                            'pending',     'low',        0, 12, '2024-11-01'),

    -- Project 4: Metro Station (4 tasks - all completed)
    (4, 'Platform Extension',             'Extend platform A and B by 80 meters each including edge screens',                    'completed',   'critical', 100, 4,  '2024-03-01'),
    (4, 'Ventilation System Upgrade',     'Install new ventilation and air management system with heat recovery',                'completed',   'high',     100, 6,  '2024-04-15'),
    (4, 'Accessibility Upgrades',         'Install elevators, ramps, and tactile paving for disabled access',                    'completed',   'medium',   100, 7,  '2024-04-01'),
    (4, 'Signage & Wayfinding System',    'Install digital signage, wayfinding kiosks, and emergency exit marking',              'completed',   'low',      100, 8,  '2024-03-15'),

    -- Project 5: Corporate HQ (2 tasks)
    (5, 'Interior Demolition & Prep',     'Remove existing interiors, level floors, prepare MEP rough-ins',                     'blocked',     'high',      30, 4,  '2024-05-15'),
    (5, 'MEP Rough-In (Floors 1-6)',      'Complete electrical, data, plumbing rough-in for lower 6 floors',                    'pending',     'high',       0, 5,  '2024-07-01'),

    -- Project 6: Mirpur Flyover (5 tasks)
    (6, 'Route Survey & Alignment',       'Complete detailed route survey and finalize alignment plans',                         'completed',   'critical', 100, 10, '2024-10-15'),
    (6, 'Utility Relocation',             'Relocate water, gas, electrical, and telecom utilities along the corridor',           'in_progress', 'critical',  35, 11, '2025-01-30'),
    (6, 'Pier Foundation Work',           'Bored cast-in-situ pile foundations for piers 1-15',                                  'in_progress', 'high',      20, 4,  '2025-03-31'),
    (6, 'Girder Fabrication',             'Fabrication of precast prestressed I-girders at casting yard',                        'pending',     'high',       0, 12, '2025-05-30'),
    (6, 'Approach Road Construction',     'Grade preparation and paving of approach roads at both ends',                         'pending',     'medium',     0, 9,  '2025-08-15'),

    -- Project 7: Port Warehouse (1 task)
    (7, 'Feasibility & Site Study',       'Conduct feasibility study, environmental impact assessment, and soil investigation',  'in_progress', 'high',      25, 7,  '2025-03-01'),

    -- Project 8: Medical College (4 tasks)
    (8, 'Master Planning & Design',       'Complete master plan and schematic design for all buildings',                         'completed',   'critical', 100, 8,  '2024-08-30'),
    (8, 'Foundation Work (Main Building)','Excavation and pile foundation for the main 500-bed hospital building',              'in_progress', 'critical',  40, 4,  '2025-02-28'),
    (8, 'Staff Quarters Construction',    'Construction of 4 staff quarters buildings (G+4 each)',                              'in_progress', 'high',      25, 11, '2025-06-30'),
    (8, 'Medical Equipment Procurement',  'Tender and procure major medical equipment (MRI, CT, X-ray, OT tables)',             'pending',     'high',       0, 3,  '2025-09-30')
  `);

  // ── Materials (22 items) ─────────────────────────────────────────────────
  await client.query(`
    INSERT INTO materials (project_id, name, unit, quantity_ordered, quantity_used, unit_cost, supplier) VALUES
    (1, 'Structural Steel Beams (W14)',  'tons',          850,   420,  1850,     'SteelPro Industries'),
    (1, 'Ready Mix Concrete (40MPa)',    'cubic meters', 12000, 5800,   185,     'ConcreteMax Ltd'),
    (1, 'Curtain Wall Glass Panels',     'sq meters',    8500,    0,   320,     'GlazeTech Solutions'),
    (1, 'Electrical Conduit (50mm)',     'meters',      45000, 18000,   8.5,    'ElecSupply Co'),
    (1, 'Rebar TMT (20mm)',              'tons',         1200,  580,   950,     'Bengal Steel Mills'),
    (2, 'Bridge Deck Concrete Mix',      'cubic meters', 3200,  1750,   195,    'ConcreteMax Ltd'),
    (2, 'Waterproofing Membrane',        'sq meters',   12000,  5200,    45,    'WaterSeal Pro'),
    (2, 'High-Tensile Steel Rebar',      'tons',          180,    92,  1200,    'SteelPro Industries'),
    (2, 'Expansion Joints',              'sets',           45,    18,  8500,    'BridgeTech GmbH'),
    (3, 'Foundation Concrete',           'cubic meters', 4500,     0,   185,    'ConcreteMax Ltd'),
    (3, 'Insulation Panels (R-30)',      'sq meters',   25000,     0,    28,    'EcoInsulate Ltd'),
    (3, 'Solar Panel System Kit',        'sets',          120,     0,  45000,   'SolarTech BD'),
    (4, 'Platform Steel Structure',      'tons',          320,  320,   1650,    'SteelPro Industries'),
    (4, 'Ventilation Fans (Industrial)', 'pieces',         24,   24,   42000,   'AirFlow Systems'),
    (5, 'Gypsum Boards',                 'sq meters',    8500,  3200,   12.5,   'BuildMate Ltd'),
    (5, 'LED Lighting Panels',           'pieces',       2400,  180,   2200,    'BrightLight Corp'),
    (6, 'Precast I-Girders',             'pieces',         75,     0,  185000,  'Precast Solutions Ltd'),
    (6, 'Crushed Stone Aggregate',       'tons',        12000,  3800,   125,    'Aggregate Pro'),
    (6, 'Steel Piles (600mm dia)',       'meters',      2800,   900,   7800,    'PileMaster Ltd'),
    (8, 'Hospital Grade Tiles',          'sq meters',   35000,  8500,   185,    'Ceramic Plus BD'),
    (8, 'PVC Waterproof Membrane',       'sq meters',   18000,  6200,    55,    'WaterSeal Pro'),
    (8, 'Structural Steel (H Columns)',  'tons',          950,   320,   1750,    'Bengal Steel Mills')
  `);

  // ── Budget Entries (28 entries) ──────────────────────────────────────────
  await client.query(`
    INSERT INTO budget_entries (project_id, category, description, planned_cost, actual_cost, date) VALUES
    (1, 'labor',     'Foundation & Structural Labor Q1',          850000,  920000, '2024-01-15'),
    (1, 'materials', 'Structural Steel & Concrete Supply',      2200000, 2180000, '2024-02-01'),
    (1, 'equipment', 'Tower Crane Rental (12 months)',           480000,  480000, '2024-01-15'),
    (1, 'labor',     'MEP Installation Labor Q2',                620000,  595000, '2024-04-01'),
    (1, 'overhead',  'Site Management & Safety Q1-Q2',           180000,  195000, '2024-01-15'),
    (1, 'materials', 'Glass & Facade Materials',                1200000,  250000, '2024-06-01'),
    (2, 'labor',     'Bridge Inspection & Deck Labor',           380000,  410000, '2024-03-01'),
    (2, 'materials', 'Concrete, Steel & Waterproofing',          920000,  875000, '2024-03-15'),
    (2, 'equipment', 'Heavy Equipment & Scaffolding',            240000,  255000, '2024-03-01'),
    (2, 'overhead',  'Traffic Management & Safety',              120000,  135000, '2024-03-01'),
    (2, 'labor',     'Deck Replacement Labor Q3',                450000,       0, '2024-07-01'),
    (3, 'labor',     'Site Survey & Planning Labor',              45000,   42000, '2024-06-01'),
    (3, 'materials', 'Initial Materials Procurement',            180000,       0, '2024-06-15'),
    (3, 'overhead',  'Permit & Environmental Clearance Fees',      85000,   72000, '2024-06-15'),
    (4, 'labor',     'Platform Extension Labor',                 520000,  515000, '2023-06-01'),
    (4, 'materials', 'Construction Materials',                   980000, 1020000, '2023-07-01'),
    (4, 'equipment', 'Tunneling Equipment',                      380000,  395000, '2023-06-01'),
    (4, 'overhead',  'Project Management & Admin',               120000,  118000, '2023-06-01'),
    (6, 'labor',     'Survey & Design Labor',                    180000,  165000, '2024-09-01'),
    (6, 'materials', 'Initial Construction Materials',           650000,  480000, '2024-10-01'),
    (6, 'equipment', 'Pile Driving Rig & Equipment',             520000,  510000, '2024-11-01'),
    (6, 'overhead',  'Traffic Diversion & Safety Management',    200000,  185000, '2024-09-01'),
    (8, 'labor',     'Design & Planning Phase Labor',            350000,  320000, '2024-05-01'),
    (8, 'materials', 'Initial Building Materials',              1100000,  950000, '2024-07-01'),
    (8, 'equipment', 'Excavation & Piling Equipment',            680000,  620000, '2024-09-01'),
    (8, 'labor',     'Foundation & Structure Labor Q1-Q2',      1200000,  780000, '2024-10-01'),
    (8, 'overhead',  'Site Setup & Administration',              280000,  295000, '2024-05-01'),
    (8, 'materials', 'Medical Equipment Phase 1',               2500000,       0, '2025-01-01')
  `);

  console.log('✅ Demo data seeded: 12 users, 8 projects, 35 tasks, 22 materials, 28 budget entries');
  console.log('🔑 Password for all accounts: password123');
}
