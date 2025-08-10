// Unit test example - tests business logic with mocked Supabase client
import { createClient } from '@supabase/supabase-js';

// Mock is automatically applied via jest.setup.ts
const mockSupabase = createClient('mock-url', 'mock-key');

describe('Supabase Client Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle ingredient search with mocked client', async () => {
    // Arrange
    const mockData = [
      { id: 1, name: 'chicken', canonical_name: 'CHICKEN' },
      { id: 2, name: 'beef', canonical_name: 'BEEF' }
    ];
    
    (mockSupabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        ilike: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: mockData, error: null })
        })
      })
    });

    // Act
    const { data, error } = await mockSupabase
      .from('ingredients')
      .select('id, name, canonical_name')
      .ilike('name', '%chicken%')
      .limit(10);

    // Assert
    expect(error).toBeNull();
    expect(data).toEqual(mockData);
    expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
  });

  it('should handle RPC function calls with mocked client', async () => {
    // Arrange
    const mockRpcResult = {
      data: [{ ingredient_id: 1, similarity: 0.95 }],
      error: null
    };
    
    (mockSupabase.rpc as jest.Mock).mockResolvedValue(mockRpcResult);

    // Act
    const result = await mockSupabase.rpc('rpc_vector_search_ingredients', {
      query_embedding: [0.1, 0.2, 0.3],
      match_threshold: 0.8,
      match_count: 5
    });

    // Assert
    expect(result).toEqual(mockRpcResult);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('rpc_vector_search_ingredients', {
      query_embedding: [0.1, 0.2, 0.3],
      match_threshold: 0.8,
      match_count: 5
    });
  });
});
