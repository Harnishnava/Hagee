// Quick test to verify GGUF service integration
const { GGUFService } = require('./services/GGUFService.ts');

async function testGGUFService() {
  try {
    console.log('Testing GGUF Service integration...');
    
    const ggufService = GGUFService.getInstance();
    console.log('✅ GGUFService instance created successfully');
    
    await ggufService.initialize();
    console.log('✅ GGUFService initialized successfully');
    
    const requirements = ggufService.getModelRequirements();
    console.log('✅ Model requirements:', requirements);
    
    console.log('✅ All basic GGUF service tests passed!');
    
  } catch (error) {
    console.error('❌ GGUF service test failed:', error.message);
  }
}

testGGUFService();
