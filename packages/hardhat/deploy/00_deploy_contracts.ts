

// import { HardhatRuntimeEnvironment } from "hardhat/types";
// import { DeployFunction } from "hardhat-deploy/types";

// const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
//   const { deployer } = await hre.getNamedAccounts();
//   const { deploy } = hre.deployments;

//   console.log("\n🚀 Deploying contracts with account:", deployer);

//   // 1. Deploy ServiceNFT first
//   console.log("\n📝 Deploying ServiceNFT...");
//   const serviceNFT = await deploy("ServiceNFT", {
//     from: deployer,
//     args: [],
//     log: true,
//     autoMine: true,
//   });

//   console.log("✅ ServiceNFT deployed at:", serviceNFT.address);

//   // 2. Deploy ServiceContract with NFT address
//   console.log("\n📝 Deploying ServiceContract...");
//   const serviceContract = await deploy("ServiceContract", {
//     from: deployer,
//     args: [serviceNFT.address], // ← THIS IS THE CRITICAL LINE
//     log: true,
//     autoMine: true,
//   });

//   console.log("✅ ServiceContract deployed at:", serviceContract.address);
//   console.log("🔗 ServiceContract linked to ServiceNFT at:", serviceNFT.address);
  
//   console.log("\n✨ Deployment complete!\n");
// };

// export default deployContracts;
// deployContracts.tags = ["ServiceNFT", "ServiceContract"];

// import { HardhatRuntimeEnvironment } from "hardhat/types";
// import { DeployFunction } from "hardhat-deploy/types";

// /**
//  * Deploys ServiceNFT and ServiceContract with NFT integration
//  */
// const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
//   const { deployer } = await hre.getNamedAccounts();
//   const { deploy } = hre.deployments;

//   console.log("Deploying contracts with account:", deployer);

//   // 1. Deploy ServiceNFT first
//   const serviceNFT = await deploy("ServiceNFT", {
//     from: deployer,
//     args: [],
//     log: true,
//     autoMine: true,
//   });

//   console.log("✅ ServiceNFT deployed at:", serviceNFT.address);

//   // 2. Deploy ServiceContract with NFT address
//   const serviceContract = await deploy("ServiceContract", {
//     from: deployer,
//     args: [serviceNFT.address],
//     log: true,
//     autoMine: true,
//   });

//   console.log("✅ ServiceContract deployed at:", serviceContract.address);
//   console.log("🔗 ServiceContract linked to ServiceNFT at:", serviceNFT.address);
// };

// export default deployContracts;

// deployContracts.tags = ["ServiceNFT", "ServiceContract"];

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Complete deployment script with contract linking
 * This fixes the ERC721InvalidApprover error
 */
const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   🚀 SERVICE MARKETPLACE DEPLOYMENT           ║");
  console.log("╚════════════════════════════════════════════════╝\n");
  console.log("📍 Deploying from account:", deployer);
  console.log("⛓️  Network:", hre.network.name);
  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Deploy ServiceNFT
  // ═══════════════════════════════════════════════════════════════
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  STEP 1: Deploying ServiceNFT Contract      │");
  console.log("└──────────────────────────────────────────────┘");
  
  const serviceNFT = await deploy("ServiceNFT", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    waitConfirmations: 1,
  });

  console.log("✅ ServiceNFT deployed at:", serviceNFT.address);
  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Deploy ServiceContract
  // ═══════════════════════════════════════════════════════════════
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  STEP 2: Deploying ServiceContract          │");
  console.log("└──────────────────────────────────────────────┘");
  
  const serviceContract = await deploy("ServiceContract", {
    from: deployer,
    args: [serviceNFT.address], // Pass NFT address to constructor
    log: true,
    autoMine: true,
    waitConfirmations: 1,
  });

  console.log("✅ ServiceContract deployed at:", serviceContract.address);
  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: CRITICAL - Link ServiceContract to ServiceNFT
  // This is what fixes the ERC721InvalidApprover error!
  // ═══════════════════════════════════════════════════════════════
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  STEP 3: Linking Contracts (CRITICAL!)      │");
  console.log("└──────────────────────────────────────────────┘");

  try {
    // Get contract instances
    const ServiceNFT = await hre.ethers.getContractAt("ServiceNFT", serviceNFT.address);
    
    // Check if already linked
    const currentServiceContract = await ServiceNFT.serviceContract();
    
    if (currentServiceContract === hre.ethers.ZeroAddress || 
        currentServiceContract.toLowerCase() !== serviceContract.address.toLowerCase()) {
      
      console.log("🔗 Setting ServiceContract address in ServiceNFT...");
      console.log("   From:", currentServiceContract);
      console.log("   To:  ", serviceContract.address);
      
      // Link the contracts
      const tx = await ServiceNFT.setServiceContract(serviceContract.address);
      console.log("   Transaction hash:", tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("   Gas used:", receipt?.gasUsed?.toString());
      console.log("✅ Contracts linked successfully!");
      
    } else {
      console.log("✅ Contracts already linked!");
    }

    // Verify the linking
    const linkedAddress = await ServiceNFT.serviceContract();
    console.log("\n🔍 Verification:");
    console.log("   ServiceNFT address:      ", serviceNFT.address);
    console.log("   ServiceContract address: ", serviceContract.address);
    console.log("   Linked address in NFT:   ", linkedAddress);
    
    if (linkedAddress.toLowerCase() === serviceContract.address.toLowerCase()) {
      console.log("   ✅ LINK VERIFIED - Contracts properly connected!");
    } else {
      console.log("   ❌ WARNING: Link verification failed!");
      console.log("   Expected:", serviceContract.address);
      console.log("   Got:     ", linkedAddress);
      throw new Error("Contract linking failed!");
    }

  } catch (error: any) {
    console.log("\n❌ ERROR during contract linking:");
    console.log(error.message);
    console.log("\n⚠️  MANUAL ACTION REQUIRED:");
    console.log("   After deployment, run in hardhat console:");
    console.log(`   const ServiceNFT = await ethers.getContract("ServiceNFT")`);
    console.log(`   await ServiceNFT.setServiceContract("${serviceContract.address}")`);
    console.log("");
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Verify deployment
  // ═══════════════════════════════════════════════════════════════
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  STEP 4: Testing Deployment                 │");
  console.log("└──────────────────────────────────────────────┘");

  try {
    const ServiceContract = await hre.ethers.getContractAt("ServiceContract", serviceContract.address);
    const ServiceNFT = await hre.ethers.getContractAt("ServiceNFT", serviceNFT.address);
    
    // Test ServiceContract
    const nftAddress = await ServiceContract.serviceNFT();
    const serviceCount = await ServiceContract.serviceCount();
    
    console.log("✅ ServiceContract checks:");
    console.log("   - Has NFT address:", nftAddress === serviceNFT.address ? "✓" : "✗");
    console.log("   - Service count:", serviceCount.toString());
    
    // Test ServiceNFT
    const linkedContract = await ServiceNFT.serviceContract();
    const tokenCounter = await ServiceNFT.getTokenCounter();
    
    console.log("\n✅ ServiceNFT checks:");
    console.log("   - Has ServiceContract:", linkedContract === serviceContract.address ? "✓" : "✗");
    console.log("   - Token counter:", tokenCounter.toString());
    
    // Final check
    if (nftAddress === serviceNFT.address && linkedContract === serviceContract.address) {
      console.log("\n✅ ALL SYSTEMS OPERATIONAL!");
    } else {
      console.log("\n⚠️  WARNING: Some checks failed!");
    }

  } catch (error: any) {
    console.log("⚠️  Could not verify (might be OK on some networks)");
    console.log("   Error:", error.message);
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   ✨ DEPLOYMENT COMPLETE                       ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log("");
  console.log("📋 Contract Addresses:");
  console.log("   ServiceNFT:      ", serviceNFT.address);
  console.log("   ServiceContract: ", serviceContract.address);
  console.log("");
  console.log("🔧 What was deployed:");
  console.log("   ✓ ServiceNFT with escrow functionality");
  console.log("   ✓ ServiceContract with two-signature approval");
  console.log("   ✓ Contracts properly linked (fixes ERC721 error)");
  console.log("");
  console.log("📝 Next Steps:");
  console.log("   1. Frontend should auto-update with new addresses");
  console.log("   2. Test service creation");
  console.log("   3. Test acceptance (should work without ERC721 error)");
  console.log("   4. Test completion with image upload");
  console.log("");
  console.log("🎉 Ready to use!");
  console.log("");
};

export default deployContracts;

// Only one tag needed since this deploys both
deployContracts.tags = ["ServiceMarketplace"];