#!/usr/bin/env python3
"""
Ingredient Consolidation Finalization Script

This script processes the edited consolidation proposal file and generates
the final ingredient hierarchy files for database seeding:

1. food_groups.csv - All unique food groups
2. ingredients.csv - All ingredients (parents, children, and standalone)
3. ingredient_parents.csv - Many-to-many parent-child relationships
4. aliases.csv - All aliases mapped to their ingredient IDs

The output files will be used by the seeding script to populate the hierarchical
ingredient database schema with support for multiple parents per ingredient.
"""

import pandas as pd
import re
import sys
import os
from collections import defaultdict

def parse_consolidation_proposal(proposal_file):
    """
    Parse the consolidation proposal file and extract approved consolidations.
    Supports multiple parents per ingredient.
    
    Returns:
        dict: Mapping of parent ingredients to their children
    """
    if not os.path.exists(proposal_file):
        print(f"Error: {proposal_file} not found. Run analyzeConsolidation.py first.")
        sys.exit(1)
    
    consolidations = {}
    current_parent = None
    
    with open(proposal_file, 'r') as f:
        for line in f:
            line = line.strip()
            
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            
            # Check for parent ingredient section header
            if line.startswith('[') and line.endswith(']'):
                current_parent = line[1:-1]  # Remove brackets
                consolidations[current_parent] = []
                continue
            
            # Parse child ingredient line
            if current_parent and ',' in line:
                parts = line.split(',', 1)  # Split on first comma only
                if len(parts) == 2:
                    child_name = parts[0].strip()
                    food_group = parts[1].strip()
                    consolidations[current_parent].append({
                        'name': child_name,
                        'food_group': food_group
                    })
    
    # Remove empty consolidation groups
    consolidations = {
        parent: children for parent, children in consolidations.items()
        if children
    }
    
    return consolidations

def determine_parent_food_group(children):
    """
    Determine the most appropriate food group for a parent ingredient
    based on its children's food groups.
    """
    food_groups = [child['food_group'] for child in children]
    
    # Return the most common food group
    from collections import Counter
    food_group_counts = Counter(food_groups)
    return food_group_counts.most_common(1)[0][0]

def generate_hierarchy_files(consolidations, original_df, output_dir='seed'):
    """
    Generate the hierarchy CSV files for database seeding with support for
    multiple parents per ingredient.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Extract all unique food groups
    all_food_groups = set(original_df['food_group'].unique())
    for children in consolidations.values():
        for child in children:
            all_food_groups.add(child['food_group'])
    
    food_groups_df = pd.DataFrame({
        'name': sorted(all_food_groups)
    })
    food_groups_file = os.path.join(output_dir, 'food_groups.csv')
    food_groups_df.to_csv(food_groups_file, index=False)
    print(f"Created {food_groups_file} with {len(food_groups_df)} food groups")
    
    # 2. Collect all ingredients (parents, children, and standalone)
    all_ingredients = {}
    parent_child_relationships = []
    
    # First, add all parent ingredients
    for parent_name, children in consolidations.items():
        parent_food_group = determine_parent_food_group(children)
        # Add parent to all_ingredients if not already there
        if parent_name not in all_ingredients:
            all_ingredients[parent_name] = {
                'name': parent_name,
                'food_group': parent_food_group,
                'hierarchy_depth': 0  # Parents are top-level
            }
        
        # Process children and create parent-child relationships
        for child in children:
            child_name = child['name']
            child_food_group = child['food_group']
            
            # Skip creating parent-child relationship if parent and child names are identical
            # This prevents duplicate ingredients in the database
            if child_name == parent_name:
                print(f"Note: Skipping self-reference for '{child_name}' (same as parent)")
                continue
                
            # Add child to all_ingredients if not already there
            if child_name not in all_ingredients:
                all_ingredients[child_name] = {
                    'name': child_name,
                    'food_group': child_food_group,
                    'hierarchy_depth': 1  # Direct children start at depth 1
                }
            else:
                # Child already exists, might need to update hierarchy_depth
                # We'll calculate the final depth after all relationships are processed
                pass
            
            # Add parent-child relationship
            parent_child_relationships.append({
                'parent_name': parent_name,
                'child_name': child_name
            })
    
    # Add standalone ingredients (those not in any relationship)
    for _, row in original_df.iterrows():
        ingredient_name = row['pd_name']
        if ingredient_name not in all_ingredients:
            all_ingredients[ingredient_name] = {
                'name': ingredient_name,
                'food_group': row['food_group'],
                'hierarchy_depth': 0  # Standalone ingredients are top-level
            }
    
    # Calculate hierarchy depths for ingredients with multiple parents
    # We need to take the maximum depth among all paths
    ingredient_depths = {name: 0 for name in all_ingredients.keys()}
    
    # Build a graph of parent-child relationships
    child_to_parents = defaultdict(list)
    for rel in parent_child_relationships:
        child_to_parents[rel['child_name']].append(rel['parent_name'])
    
    # Helper function to calculate depth recursively
    def calculate_depth(ingredient_name, visited=None):
        if visited is None:
            visited = set()
            
        # Detect cycles
        if ingredient_name in visited:
            print(f"Warning: Cycle detected involving {ingredient_name}")
            return 0
            
        visited.add(ingredient_name)
        
        # If no parents, depth is 0
        parents = child_to_parents.get(ingredient_name, [])
        if not parents:
            return 0
            
        # Calculate max depth of all parents + 1
        max_parent_depth = 0
        for parent in parents:
            parent_depth = calculate_depth(parent, visited.copy())
            max_parent_depth = max(max_parent_depth, parent_depth)
            
        return max_parent_depth + 1
    
    # Calculate depths for all ingredients
    for name in all_ingredients.keys():
        depth = calculate_depth(name)
        all_ingredients[name]['hierarchy_depth'] = depth
    
    # Convert to dataframes and save
    ingredients_df = pd.DataFrame(list(all_ingredients.values()))
    ingredients_file = os.path.join(output_dir, 'ingredients.csv')
    ingredients_df.to_csv(ingredients_file, index=False)
    print(f"Created {ingredients_file} with {len(ingredients_df)} ingredients")
    
    # Save parent-child relationships
    if parent_child_relationships:
        relationships_df = pd.DataFrame(parent_child_relationships)
        relationships_file = os.path.join(output_dir, 'ingredient_parents.csv')
        relationships_df.to_csv(relationships_file, index=False)
        print(f"Created {relationships_file} with {len(relationships_df)} parent-child relationships")
    
    # Generate aliases (from original synonyms, mapped to final ingredients)
    # Read original synonyms
    synonyms_file = os.path.join(output_dir, 'ingid_synonyms.csv')
    aliases_count = 0
    
    if os.path.exists(synonyms_file):
        synonyms_df = pd.read_csv(synonyms_file)
        
        # Create mapping from original PD names to final ingredient names
        # For multi-parent ingredients, map to the ingredient itself, not its parents
        pd_to_ingredient = {name: name for name in all_ingredients.keys()}
        
        # Generate final aliases
        final_aliases = []
        for _, row in synonyms_df.iterrows():
            original_pd = row['pd_name']
            alias_name = row['alias_name']
            
            if original_pd in pd_to_ingredient:
                final_ingredient = pd_to_ingredient[original_pd]
                final_aliases.append({
                    'alias_name': alias_name,
                    'ingredient_name': final_ingredient
                })
        
        aliases_df = pd.DataFrame(final_aliases)
        aliases_file = os.path.join(output_dir, 'final_aliases.csv')
        aliases_df.to_csv(aliases_file, index=False)
        aliases_count = len(aliases_df)
        print(f"Created {aliases_file} with {aliases_count} aliases")
    else:
        print(f"Warning: {synonyms_file} not found, skipping alias generation")
    
    return {
        'food_groups': len(food_groups_df),
        'ingredients': len(ingredients_df),
        'parent_child_relationships': len(parent_child_relationships),
        'aliases': aliases_count
    }

def main():
    # Check if proposal file exists
    proposal_file = 'seed/consolidation_proposal.txt'
    if not os.path.exists(proposal_file):
        print(f"Error: {proposal_file} not found.")
        print("Run analyzeConsolidation.py first to generate the proposal.")
        sys.exit(1)
    
    # Check if original filtered data exists
    filtered_csv = 'seed/ingid_pd.csv'
    if not os.path.exists(filtered_csv):
        print(f"Error: {filtered_csv} not found.")
        print("Run generateCSVs.py first to generate filtered ingredients.")
        sys.exit(1)
    
    print("Processing consolidation proposal...")
    
    # Parse the consolidation proposal
    consolidations = parse_consolidation_proposal(proposal_file)
    
    if not consolidations:
        print("No consolidations found in proposal file.")
        print("All ingredients will be treated as standalone.")
    else:
        print(f"Found {len(consolidations)} consolidation groups")
        total_children = sum(len(children) for children in consolidations.values())
        print(f"Total ingredients to consolidate: {total_children}")
    
    # Read original filtered data
    print(f"Reading {filtered_csv}...")
    original_df = pd.read_csv(filtered_csv)
    
    # Generate hierarchy files
    print("Generating hierarchy files...")
    stats = generate_hierarchy_files(consolidations, original_df)
    
    print("\nHierarchy Generation Complete!")
    print("="*50)
    print(f"Food groups:                {stats['food_groups']}")
    print(f"Total ingredients:          {stats['ingredients']}")
    print(f"Parent-child relationships: {stats['parent_child_relationships']}")
    print(f"Aliases:                    {stats['aliases']}")
    
    # Count ingredients by hierarchy depth
    ingredients_df = pd.read_csv('seed/ingredients.csv')
    depth_counts = ingredients_df['hierarchy_depth'].value_counts().sort_index()
    
    print("\nIngredient hierarchy depths:")
    for depth, count in depth_counts.items():
        print(f"  Depth {depth}: {count} ingredients")
    
    print(f"\nFiles created in seed/ directory:")
    print(f"- food_groups.csv")
    print(f"- ingredients.csv")
    print(f"- ingredient_parents.csv")
    print(f"- final_aliases.csv")
    
    print(f"\nNext step: Update and run the seeding script to populate the database with the new multi-parent hierarchy")

if __name__ == "__main__":
    main()
