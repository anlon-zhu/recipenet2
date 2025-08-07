#!/usr/bin/env python3
"""
Script to convert USDA IngID Thesaurus Excel file to CSV format
for Sprint 3 database seeding.
"""

import pandas as pd
import os
import sys

def main():
    excel_file = 'seed/THESAURUSFORPUBLICRELEASE.XLSX'
    if not os.path.exists(excel_file):
        print(f"Error: {excel_file} not found in current directory")
        sys.exit(1)
    
    print(f"Reading {excel_file}...")
    
    try:
        df = pd.read_excel(excel_file)
        
        print(f"\nColumns in the Excel file:")
        print(df.columns.tolist())
        print(f"\nData shape: {df.shape}")
        print(f"\nFirst 5 rows:")
        print(df.head())
        
        os.makedirs('seed', exist_ok=True)
        
        # Based on typical USDA IngID structure, we expect columns like:
        # - Some form of preferred descriptor (PD)
        # - Food group information
        # - Synonyms/aliases
        
        print(f"\nColumn details:")
        for col in df.columns:
            print(f"- {col}: {df[col].dtype}, non-null: {df[col].count()}")
        
        df.to_csv('seed/raw_ingid_data.csv', index=False)
        print(f"\nRaw data saved to seed/raw_ingid_data.csv")
        
    except Exception as e:
        print(f"Error processing Excel file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
