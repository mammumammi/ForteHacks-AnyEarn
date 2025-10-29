import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🚀 Deploying contracts with account:", deployer);

  // 1. Deploy ServiceNFT first
  console.log("\n📝 Deploying ServiceNFT...");
  const serviceNFT = await deploy("ServiceNFT", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  console.log("✅ ServiceNFT deployed at:", serviceNFT.address);

  // 2. Deploy ServiceContract with NFT address
  console.log("\n📝 Deploying ServiceContract...");
  const serviceContract = await deploy("ServiceContract", {
    from: deployer,
    args: [serviceNFT.address], // ← THIS IS THE CRITICAL LINE
    log: true,
    autoMine: true,
  });

  console.log("✅ ServiceContract deployed at:", serviceContract.address);
  console.log("🔗 ServiceContract linked to ServiceNFT at:", serviceNFT.address);
  
  console.log("\n✨ Deployment complete!\n");
};

export default deployContracts;
deployContracts.tags = ["ServiceNFT", "ServiceContract"];