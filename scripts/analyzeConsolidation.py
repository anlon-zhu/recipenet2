#!/usr/bin/env python3
"""
Dynamic Ingredient Consolidation Analysis Script

This script uses word frequency analysis and heuristics to identify consolidation
opportunities without relying on hard-coded ingredient categories.

The approach:
1. Find all words that appear in multiple ingredient names
2. Use frequency and pattern heuristics to identify good consolidation candidates
3. Group ingredients that share these common words
4. Score groups based on semantic coherence and practical utility
"""

import pandas as pd
import re
from collections import defaultdict, Counter
import sys
import os

# Constants for word extraction and filtering
MIN_WORD_LENGTH = 3
COMMON_ARTICLES = {'THE', 'AND', 'OR', 'OF', 'IN', 'ON', 'AT', 'TO', 'FOR', 'WITH'}

# Constants for scoring and filtering
MIN_GROUP_SIZE = 2
MAX_INGREDIENT_PERCENTAGE = 0.1  # Max % of total ingredients a word can appear in
MIN_SCORE_THRESHOLD = 30
MAX_FREQUENCY_SCORE = 100
BEGINNING_WORD_BONUS = 30
MEDIUM_WORD_BONUS = 10  # For words >= 4 chars
LONG_WORD_BONUS = 20    # For words >= 6 chars
COHERENCE_MULTIPLIER = 40

# Constants for multi-parent support
MAX_PARENTS_PER_INGREDIENT = 3  # Maximum number of parents an ingredient can have
MIN_SECONDARY_PARENT_SCORE = 50  # Minimum score for additional parents beyond the first

# Constants for processing term identification
PROCESSING_TERM_THRESHOLD = 0.15
BASE_WORD_DIVERSITY_RATIO = 0.3

# Constants for output
PROPOSAL_FILE = 'seed/consolidation_proposal.txt'
INPUT_CSV = 'seed/ingid_pd.csv'
TOP_GROUPS_TO_SHOW = 10
EXAMPLE_CHILDREN_TO_SHOW = 2

def clean_ingredient_name(name):
    """
    Basic cleaning while preserving all meaningful words.
    """
    # Convert to uppercase and strip
    name = name.upper().strip()
    
    # Remove special characters but keep spaces and common punctuation
    name = re.sub(r'[^\w\s\-\,\.]', ' ', name)
    
    # Normalize whitespace
    name = re.sub(r'\s+', ' ', name)
    
    return name.strip()

def extract_meaningful_words(ingredient_name, min_word_length=MIN_WORD_LENGTH):
    """
    Extract words that could potentially be grouping candidates.
    """
    cleaned = clean_ingredient_name(ingredient_name)
    words = cleaned.split()
    
    meaningful_words = []
    for word in words:
        if len(word) >= min_word_length and word not in COMMON_ARTICLES:
            meaningful_words.append(word)
    
    return meaningful_words

def find_word_frequencies(ingredients_df):
    """
    Analyze word frequencies across all ingredients to identify potential grouping words.
    """
    word_frequency = Counter()
    word_to_ingredients = defaultdict(set)
    
    for _, row in ingredients_df.iterrows():
        ingredient_name = row['pd_name']
        words = extract_meaningful_words(ingredient_name)
        
        for word in words:
            word_frequency[word] += 1
            word_to_ingredients[word].add(ingredient_name)
    
    return word_frequency, word_to_ingredients

def calculate_grouping_potential(word, ingredients_with_word, all_ingredients):
    """
    Calculate how good a word is for grouping ingredients using heuristics.
    """
    num_ingredients = len(ingredients_with_word)
    
    # Skip words that appear in too few or too many ingredients
    if num_ingredients < MIN_GROUP_SIZE:
        return 0
    if num_ingredients > len(all_ingredients) * MAX_INGREDIENT_PERCENTAGE:
        return 0
    
    score = 0
    
    # Base score from frequency (more ingredients = higher potential)
    score += min(num_ingredients * 10, MAX_FREQUENCY_SCORE)
    
    # Analyze the ingredients to see if they form a coherent group
    coherence_score = calculate_word_coherence(word, ingredients_with_word)
    score += coherence_score
    
    # Bonus for words that appear at the beginning of ingredient names (likely main ingredient)
    beginning_appearances = sum(1 for ing in ingredients_with_word 
                              if clean_ingredient_name(ing).startswith(word + ' '))
    beginning_ratio = beginning_appearances / num_ingredients
    score += beginning_ratio * BEGINNING_WORD_BONUS
    
    # Bonus for consistent word length (avoid very generic short words)
    if len(word) >= 6:
        score += LONG_WORD_BONUS
    elif len(word) >= 4:
        score += MEDIUM_WORD_BONUS
    
    return score

def calculate_word_coherence(word, ingredients_with_word):
    """
    Analyze if ingredients containing this word form a coherent group.
    """
    if len(ingredients_with_word) < MIN_GROUP_SIZE:
        return 0
    
    # Look for common patterns in the remaining words
    other_words_counter = Counter()
    
    for ingredient in ingredients_with_word:
        words = extract_meaningful_words(ingredient)
        for w in words:
            if w != word:  # Exclude the grouping word itself
                other_words_counter[w] += 1
    
    # Calculate coherence based on how many other words are shared
    total_other_words = sum(other_words_counter.values())
    if total_other_words == 0:
        return 0
    
    # Look for words that appear in multiple ingredients with this base word
    shared_words = [w for w, count in other_words_counter.items() if count > 1]
    coherence_ratio = len(shared_words) / len(other_words_counter) if other_words_counter else 0
    
    return coherence_ratio * COHERENCE_MULTIPLIER

def identify_processing_terms_dynamically(word_frequency, word_to_ingredients, threshold_ratio=PROCESSING_TERM_THRESHOLD):
    """
    Dynamically identify processing terms by finding words that appear frequently
    across many different base ingredients.
    """
    processing_terms = set()
    
    for word, frequency in word_frequency.items():
        if frequency > len(word_to_ingredients) * threshold_ratio:
            # This word appears in many ingredients, likely a processing term
            ingredients = word_to_ingredients[word]
            
            # Check if it appears with many different "base" words
            base_word_diversity = set()
            for ingredient in ingredients:
                words = extract_meaningful_words(ingredient)
                for w in words:
                    if w != word and len(w) >= 4:
                        base_word_diversity.add(w)
            
            # If this word appears with many different bases, it's likely a processing term
            if len(base_word_diversity) > frequency * BASE_WORD_DIVERSITY_RATIO:
                processing_terms.add(word)
    
    return processing_terms

def find_consolidation_groups(ingredients_df):
    """
    Find consolidation groups using dynamic word analysis.
    Support multiple parents per ingredient.
    """
    # Find word frequencies and ingredient associations
    word_frequency, word_to_ingredients = find_word_frequencies(ingredients_df)
    
    # Identify processing terms to exclude
    processing_terms = identify_processing_terms_dynamically(
        word_frequency, word_to_ingredients)
    
    # Calculate scores for each potential grouping word
    word_scores = {}
    for word, ingredients_with_word in word_to_ingredients.items():
        if word in processing_terms:
            continue
        
        score = calculate_grouping_potential(
            word, ingredients_with_word, ingredients_df['pd_name'])
        
        if score >= MIN_SCORE_THRESHOLD:
            word_scores[word] = score
    
    # Sort words by score (descending)
    sorted_words = sorted(word_scores.items(), key=lambda x: x[1], reverse=True)
    
    # Create consolidation groups
    consolidation_groups = {}
    ingredient_parent_count = defaultdict(int)  # Track number of parents per ingredient
    
    for word, score in sorted_words:
        ingredients_with_word = word_to_ingredients[word]
        
        # For secondary parents, we need a higher score threshold
        min_score = MIN_SCORE_THRESHOLD if score >= MIN_SECONDARY_PARENT_SCORE else 0
        
        # Filter out ingredients that already have max parents
        available_ingredients = [ing for ing in ingredients_with_word 
                               if ingredient_parent_count[ing] < MAX_PARENTS_PER_INGREDIENT]
        
        if len(available_ingredients) >= 2:
            # Create the consolidation group
            group_data = []
            for ingredient in available_ingredients:
                # Find the food group for this ingredient
                food_group = ingredients_df[ingredients_df['pd_name'] == ingredient]['food_group'].iloc[0]
                group_data.append({
                    'name': ingredient,
                    'food_group': food_group
                })
                
                # Increment parent count for this ingredient
                ingredient_parent_count[ingredient] += 1
            
            consolidation_groups[word] = group_data
    
    return consolidation_groups

def generate_consolidation_proposal(consolidation_groups, output_file):
    """
    Generate the consolidation proposal file with support for multiple parents.
    """
    with open(output_file, 'w') as f:
        f.write("# Ingredient Consolidation Proposal\n")
        f.write("# \n")
        f.write("# This file contains proposed ingredient consolidations.\n")
        f.write("# Each section represents a potential parent ingredient with its children.\n")
        f.write("# \n")
        f.write("# The same ingredient can appear under multiple parent sections.\n")
        f.write("# \n")
        f.write("# To DISABLE a consolidation group, comment out the entire section\n")
        f.write("# by adding '#' at the beginning of each line.\n")
        f.write("# \n")
        f.write("# To REMOVE specific children from a group, comment out just those lines.\n")
        f.write("# \n")
        f.write("# Format:\n")
        f.write("# [PARENT_INGREDIENT_NAME]\n")
        f.write("# child_ingredient_name,food_group\n")
        f.write("# \n")
        f.write("# After editing, run finalizeConsolidation.py to process this file.\n")
        f.write("# \n")

        # Sort by group size
        sorted_groups = sorted(consolidation_groups.items(), 
                             key=lambda x: len(x[1]), reverse=True)
        
        for base_word, children in sorted_groups:
            f.write(f"[{base_word}]\n")
            
            for child in sorted(children, key=lambda x: x['name']):
                f.write(f"{child['name']},{child['food_group']}\n")
            
            f.write("\n")

def main():
    if not os.path.exists(INPUT_CSV):
        print(f"Error: {INPUT_CSV} not found.")
        sys.exit(1)
    
    print(f"Reading {INPUT_CSV}...")
    df = pd.read_csv(INPUT_CSV)
    
    print(f"Analyzing {len(df)} ingredients using dynamic word analysis...")
    print(f"Supporting up to {MAX_PARENTS_PER_INGREDIENT} parents per ingredient")
    
    # Find consolidation groups
    consolidation_groups = find_consolidation_groups(df)
    
    if not consolidation_groups:
        print("No consolidation opportunities found.")
        return
    
    # Statistics
    total_groups = len(consolidation_groups)
    total_children = sum(len(children) for children in consolidation_groups.values())
    
    # Count unique ingredients and multi-parent ingredients
    unique_ingredients = set()
    ingredient_parent_count = defaultdict(int)
    
    for children in consolidation_groups.values():
        for child in children:
            unique_ingredients.add(child['name'])
            ingredient_parent_count[child['name']] += 1
    
    multi_parent_count = sum(1 for count in ingredient_parent_count.values() if count > 1)
    
    print(f"\nDynamic Analysis Results:")
    print(f"- Consolidation groups found: {total_groups}")
    print(f"- Unique ingredients to consolidate: {len(unique_ingredients)}")
    print(f"- Total parent-child relationships: {total_children}")
    print(f"- Ingredients with multiple parents: {multi_parent_count}")
    print(f"- Average group size: {total_children/total_groups:.1f}")
    
    # Show top groups
    print(f"\nTop {TOP_GROUPS_TO_SHOW} groups by size:")
    sorted_groups = sorted(consolidation_groups.items(), 
                          key=lambda x: len(x[1]), reverse=True)
    
    for i, (word, children) in enumerate(sorted_groups[:TOP_GROUPS_TO_SHOW]):
        print(f"{i+1:2d}. {word}: {len(children)} ingredients")
        # Show a few examples
        for child in children[:EXAMPLE_CHILDREN_TO_SHOW]:
            print(f"     - {child['name']}")
        if len(children) > EXAMPLE_CHILDREN_TO_SHOW:
            print(f"     ... and {len(children)-EXAMPLE_CHILDREN_TO_SHOW} more")
    
    # Generate proposal
    generate_consolidation_proposal(consolidation_groups, PROPOSAL_FILE)
    
    print(f"\nProposal saved to: {PROPOSAL_FILE}")
    print(f"After editing, run finalizeConsolidation.py to generate the hierarchy CSVs.")

if __name__ == "__main__":
    main()
