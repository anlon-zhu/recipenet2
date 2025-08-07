# USDA IngID Thesaurus Seed Data Documentation

## Overview

This document explains the seed data used in Sprint 3 to populate the recipe graph database with ingredient information from the USDA IngID (Ingredient Identification) Thesaurus.

## Data Source

**Source:** USDA Agricultural Research Service (ARS)  
**URL:** https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/ingid-thesaurus/  
**File:** `THESAURUSFORPUBLICRELEASE.XLSX`  
**Original Size:** 25,671 ingredient terms mapping to 3,042 preferred descriptors

## What is the USDA IngID Thesaurus?

The USDA IngID Thesaurus is a comprehensive database that maps ingredient terms found on food labels to standardized preferred descriptors (PDs). It was developed to support food composition analysis and nutritional research by providing consistent ingredient identification across different food products.

### Key Components:
- **Preferred Descriptors (PDs):** Standardized ingredient names
- **Parsed Ingredient Terms:** Various ways ingredients appear on food labels
- **Food Groups:** Broad categorization of ingredients (15 categories)

## Filtering Logic

We implemented comprehensive filtering to focus on **whole, basic ingredients** suitable for a recipe database, excluding processed forms and additives.

### 1. Comma-Separated Processing Filter
**Rule:** Skip all ingredients with commas in their names  
**Rationale:** Commas typically indicate processing steps or preparation methods  
**Examples Filtered Out:**
- `ALMOND, ROASTED`
- `PASTA, COOKED`
- `CHICKEN BREAST, GRILLED`
- `APPLE, DRIED`
- `BEEF, GROUND`

### 2. Additives and Isolated Ingredients Filter
**Rule:** Exclude entire "Additives and Isolated ingredients (includes sweeteners)" food group  
**Rationale:** These are not whole foods suitable for recipe databases  
**Impact:** Removed 882 ingredients (100% of this category)  
**Examples Filtered Out:**
- `ACETIC ACID`
- `ALPHA-TOCOPHEROL`
- `SODIUM CHLORIDE`

### 3. Processed Forms Filter
**Rule:** Skip ingredients containing processing-related keywords  
**Keywords Filtered:**
- `EXTRACT`, `CONCENTRATE`, `OLEORESIN`
- `ISOLATE`, `PROTEIN POWDER`, `HYDROLYZED`
- `MODIFIED`, `ARTIFICIAL`, `SYNTHETIC`
- `EMULSIFIER`, `STABILIZER`, `THICKENER`
- `FLAVOR`, `FLAVORING`, `COLORING`

**Examples Filtered Out:**
- `ALMOND EXTRACT`
- `VANILLA FLAVORING`
- `CORN STARCH MODIFIED`

### 4. Chemical Compounds Filter
**Rule:** Skip chemical compound names and additives  
**Patterns Filtered:**
- Names starting with chemical prefixes (e.g., `ALPHA-`, `BETA-`)
- Names ending with `ACID`
- E-numbers and FD&C codes
- Names containing numbers

**Examples Filtered Out:**
- `ALPHA-TOCOPHEROL ACETATE`
- `CITRIC ACID`
- `FD&C RED NO. 40`

## Filtering Results

### Overall Impact
- **Original Ingredients:** 3,042 preferred descriptors
- **Filtered Ingredients:** 1,935 preferred descriptors
- **Filtering Efficiency:** 63.6% kept (36.4% filtered out)
- **Original Synonyms:** 25,671 terms
- **Filtered Synonyms:** 13,219 terms

### Food Group Distribution (After Filtering)

| Food Group | Count | Percentage |
|------------|-------|------------|
| Fats and Oils | 494 | 25.5% |
| Fruits and Fruit Products | 266 | 13.7% |
| Grains and Grain Products | 221 | 11.4% |
| Spices, Herbs and Flavorings | 197 | 10.2% |
| Dairy and Dairy Products | 196 | 10.1% |
| Vegetables and Vegetable Products | 192 | 9.9% |
| Nut and Seed Products | 129 | 6.7% |
| Poultry Products | 86 | 4.4% |
| Legumes and Legume Products | 80 | 4.1% |
| Seafood and Seafood Products | 52 | 2.7% |
| Algae | 13 | 0.7% |
| Eggs and Egg Products | 13 | 0.7% |
| Fungi | 17 | 0.9% |
| Beverages | 16 | 0.8% |

### Major Filtering Impact by Food Group

| Food Group | Original | Filtered | Removed | % Kept |
|------------|----------|----------|---------|--------|
| Additives and Isolated ingredients | 882 | 0 | 882 | 0% |
| Fruits and Fruit Products | 362 | 266 | 96 | 73.5% |
| Fats and Oils | 528 | 494 | 34 | 93.6% |
| Vegetables and Vegetable Products | 224 | 192 | 32 | 85.7% |
| Grains and Grain Products | 237 | 221 | 16 | 93.2% |

## Sample Filtered Ingredients

### Whole Foods Kept:
- `ACAI BERRY`
- `ALMOND`
- `APPLE`
- `BEEF`
- `BROCCOLI`
- `CHICKEN BREAST`
- `OLIVE OIL`
- `QUINOA`
- `SALMON`
- `TOMATO`

### Processed Forms Filtered Out:
- `"ALMOND, ROASTED"` (quoted processing)
- `ALMOND EXTRACT` (extract)
- `APPLE JUICE CONCENTRATE` (concentrate)
- `BEEF STOCK` (processed)
- `CHICKEN FLAVORING` (flavoring)

## Database Schema

The filtered data populates two main tables:

### `ingredients` Table
- `id`: UUID primary key
- `canonical`: Preferred descriptor name (uppercase)
- `food_group`: USDA food group classification
- `embedding`: Vector embedding for semantic search (1536 dimensions)

### `ingredient_aliases` Table
- `id`: UUID primary key
- `name`: Alias/synonym name (lowercase)
- `ingredient_id`: Foreign key to ingredients table

## Usage in Recipe Graph

This curated ingredient dataset serves as the foundation for:

1. **Recipe Parsing:** Mapping ingredient mentions in recipes to canonical forms
2. **Semantic Search:** Finding similar ingredients using vector embeddings
3. **Nutritional Analysis:** Linking to USDA nutritional databases
4. **Recipe Recommendations:** Understanding ingredient relationships and substitutions

## Reproducibility

All filtering logic is implemented in reproducible Python scripts:

- `scripts/convertExcelToCSV.py`: Converts original Excel to raw CSV
- `scripts/generateCSVs.py`: Applies filtering logic and generates final CSVs
- `scripts/seedIngID.ts`: Populates database with embeddings

## Quality Assurance

The filtering approach prioritizes:
- **Whole Foods:** Basic, unprocessed ingredients
- **Recipe Relevance:** Ingredients commonly used in home cooking
- **Semantic Clarity:** Clear, unambiguous ingredient names
- **Database Efficiency:** Manageable dataset size for embeddings and search

This curated approach ensures our recipe graph database contains high-quality, relevant ingredient data suitable for modern recipe applications while maintaining the scientific rigor of the USDA source data.
