#!/usr/bin/env python3
"""
Script to generate filtered ingid_pd.csv and ingid_synonyms.csv from USDA IngID Thesaurus
for database seeding with canonical ingredients.

Filtering Logic:
1. Normalize ingredient names by removing processing steps and parenthetical content
2. Skip additives and isolated ingredients (not whole foods)
3. Skip extracts, concentrates, and highly processed forms
4. Focus on whole, basic ingredients suitable for recipe databases
5. Deduplicate normalized ingredients
"""

import pandas as pd
import os
import sys
import re

def normalize_ingredient_name(pd_name):
    """
    Normalize ingredient name by removing processing steps and parenthetical content.
    
    Args:
        pd_name (str): Preferred descriptor name
        
    Returns:
        str: Normalized ingredient name
    """
    # Take only the part before the first comma
    if ',' in pd_name:
        pd_name = pd_name.split(',')[0].strip()
    
    # Remove parenthetical content
    pd_name = re.sub(r'\([^)]*\)', '', pd_name).strip()
    
    return pd_name.upper()

def should_include_ingredient(pd_name, food_group):
    """
    Determine if an ingredient should be included based on filtering criteria.
    Balances removing over-processed ingredients while keeping canonical recipe ingredients.
    
    Args:
        pd_name (str): Preferred descriptor name (already normalized)
        food_group (str): Food group classification
        
    Returns:
        bool: True if ingredient should be included, False otherwise
    """
    pd_upper = pd_name.upper()
    
    # Skip additives and isolated ingredients except for baking powder and sodium bicarbonate
    if food_group == 'Additives and Isolated ingredients (includes sweeteners)' and pd_name not in ['BAKING POWDER', 'SODIUM BICARBONATE']:
        return False
    
    # Skip highly processed forms. Manually curated list of over-processed forms
    processed_keywords = [
        # Chemical processing
        'EXTRACT', 'CONCENTRATE', 'OLEORESIN', 'ISOLATE', 'PROTEIN POWDER',
        'HYDROLYZED', 'MODIFIED', 'ARTIFICIAL', 'SYNTHETIC',
        'PHOSPHATE', 'SULFATE', 'CHLORIDE', 'OXIDE', 'HYDROXIDE',
        
        # Food processing methods
        'FERMENTED', 'DISTILLED', 'REFINED', 'PROCESSED',
        'DEGERMINATED', 'RECONSTITUTED', 'DEHYDRATED', 'FREEZE DRIED',
        'PASTEURIZED', 'STERILIZED', 'IRRADIATED', 'SMOKED',
        
        # Food additives and agents
        'EMULSIFIER', 'STABILIZER', 'THICKENER', 'PRESERVATIVE',
        'FLAVOR', 'FLAVORING', 'COLORING', 'DYE', 'PIGMENT',
        'SWEETENER', 'ENHANCER', 'AGENT', 'ADDITIVE',
        
        # Chemical compounds and vitamins
        'TOCOPHEROL', 'ASCORBIC', 'CITRIC', 'LACTIC', 'MALIC',
        'TARTARIC', 'BENZOIC', 'SORBIC', 'PROPIONIC',
        
        # Over-processed forms
        'GRANULES', 'CRYSTALS', 'SOLUTION', 'SUSPENSION'
    ]
    
    for keyword in processed_keywords:
        if keyword in pd_upper:
            return False
    
    # Skip very specific chemical compounds
    if re.match(r'^[A-Z]+-[A-Z]+', pd_name):  # e.g., "ALPHA-TOCOPHEROL"
        return False
    
    # Skip ingredients that are clearly additives based on name patterns
    additive_patterns = [
        r'\b\d+\b',  # Contains numbers (often E-numbers or chemical codes)
        r'^E\d+',    # E-numbers
        r'ACID$',    # Ends with ACID (but allow canonical vinegars above)
        r'^FD&C',    # Food coloring codes
        r'\bVITAMIN\b',  # Vitamin supplements
        r'\bMINERAL\b',  # Mineral supplements
    ]
    
    for pattern in additive_patterns:
        if re.search(pattern, pd_name):
            return False
    
    # Skip over-processed variants of canonical ingredients, pulps, purees
    over_processed_patterns = [
        r'FROM CONCENTRATE$',  
        r'CONCENTRATE$',      
        r'\bDRIED$',       
        r'\bPUREE$',          
        r'\bPULP$',       
    ]
    
    for pattern in over_processed_patterns:
        if re.search(pattern, pd_upper):
            return False
    
    return True

def main():
    raw_csv = 'seed/raw_ingid_data.csv'
    if not os.path.exists(raw_csv):
        print(f"Error: {raw_csv} not found. Run convertExcelToCSV.py first.")
        sys.exit(1)
    
    print(f"Reading {raw_csv}...")
    df = pd.read_csv(raw_csv)
    
    print("Creating ingid_pd.csv...")
    pd_df = df[['Preferred descriptor', 'Broad group']].drop_duplicates()
    pd_df.columns = ['pd_name', 'food_group']
    
    # First normalize all ingredient names
    print("Normalizing ingredient names...")
    pd_df['original_pd_name'] = pd_df['pd_name'].copy()  # Keep original for reference
    pd_df['pd_name'] = pd_df['pd_name'].apply(normalize_ingredient_name)
    pd_df['food_group'] = pd_df['food_group'].str.strip()
    
    pd_df = pd_df.dropna()
    
    # Deduplicate after normalization
    print(f"Before deduplication: {len(pd_df)} ingredients")
    # For duplicates, keep the first occurrence (which is typically the simplest form)
    pd_df = pd_df.drop_duplicates(subset=['pd_name', 'food_group'])
    print(f"After deduplication: {len(pd_df)} ingredients")
    print(f"Removed {len(df[['Preferred descriptor', 'Broad group']].drop_duplicates()) - len(pd_df)} duplicate normalized ingredients")
    
    print(f"Before filtering: {len(pd_df)} ingredients")
    
    pd_df['include'] = pd_df.apply(lambda row: should_include_ingredient(row['pd_name'], row['food_group']), axis=1)
    filtered_pd_df = pd_df[pd_df['include']].drop('include', axis=1)
    
    print(f"After filtering: {len(filtered_pd_df)} ingredients")
    print(f"Filtered out: {len(pd_df) - len(filtered_pd_df)} ingredients")
    
    # Drop the original_pd_name column for the final output
    filtered_pd_df = filtered_pd_df.drop('original_pd_name', axis=1)
    filtered_pd_df = filtered_pd_df.sort_values('pd_name')
    
    filtered_pd_df.to_csv('seed/ingid_pd.csv', index=False)
    print(f"Created seed/ingid_pd.csv with {len(filtered_pd_df)} preferred descriptors")
    
    included_pd_names = set(filtered_pd_df['pd_name'])
    
    print("Creating ingid_synonyms.csv...")
    synonyms_df = df[['Preferred descriptor', 'Parsed ingredient term']].copy()
    synonyms_df.columns = ['original_pd_name', 'alias_name']
    
    # Create a mapping from original to normalized pd_names
    pd_name_mapping = pd.Series(
        pd_df['pd_name'].values,
        index=pd_df['original_pd_name']
    ).to_dict()
    
    # Map the original pd_names to their normalized versions
    synonyms_df['pd_name'] = synonyms_df['original_pd_name'].map(pd_name_mapping)
    synonyms_df['alias_name'] = synonyms_df['alias_name'].str.strip().str.lower()
    
    synonyms_df = synonyms_df.dropna()
    
    print(f"Before filtering synonyms: {len(synonyms_df)} synonyms")
    
    synonyms_df = synonyms_df[synonyms_df['pd_name'].isin(included_pd_names)]
    
    print(f"After filtering by included PDs: {len(synonyms_df)} synonyms")
    
    # Drop the original_pd_name column
    synonyms_df = synonyms_df.drop('original_pd_name', axis=1)
    
    # Deduplicate synonyms
    synonyms_df = synonyms_df.drop_duplicates()
    
    # Remove self-references (where pd_name equals alias_name)
    synonyms_df = synonyms_df[synonyms_df['pd_name'].str.lower() != synonyms_df['alias_name']]
    
    synonyms_df = synonyms_df.sort_values(['pd_name', 'alias_name'])
    
    synonyms_df.to_csv('seed/ingid_synonyms.csv', index=False)
    print(f"Created seed/ingid_synonyms.csv with {len(synonyms_df)} synonyms")
    
    # Print some statistics
    print(f"\nSummary:")
    print(f"- Unique preferred descriptors (filtered): {len(filtered_pd_df)}")
    print(f"- Unique food groups: {filtered_pd_df['food_group'].nunique()}")
    print(f"- Total synonyms/aliases (filtered): {len(synonyms_df)}")
    print(f"- Original total ingredients: {len(pd_df)}")
    print(f"- Filtering efficiency: {len(filtered_pd_df)/len(pd_df)*100:.1f}% kept")
    
    print(f"\nTop 5 food groups by ingredient count (after filtering):")
    print(filtered_pd_df['food_group'].value_counts().head())
    
    print(f"\nSample filtered preferred descriptors:")
    print(filtered_pd_df['pd_name'].head(10).tolist())
    
    print(f"\nFiltering removed these food groups or reduced them significantly:")
    original_counts = pd_df['food_group'].value_counts()
    filtered_counts = filtered_pd_df['food_group'].value_counts()
    
    for food_group in original_counts.index:
        original_count = original_counts[food_group]
        filtered_count = filtered_counts.get(food_group, 0)
        reduction = original_count - filtered_count
        if reduction > 0:
            print(f"- {food_group}: {original_count} → {filtered_count} (-{reduction})")

if __name__ == "__main__":
    main()
