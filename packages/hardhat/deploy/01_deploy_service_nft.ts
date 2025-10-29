import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys ServiceNFT and ServiceContract with NFT integration
 */
const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("Deploying contracts with account:", deployer);

  // 1. Deploy ServiceNFT first
  const serviceNFT = await deploy("ServiceNFT", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  console.log("✅ ServiceNFT deployed at:", serviceNFT.address);

  // 2. Deploy ServiceContract with NFT address
  const serviceContract = await deploy("ServiceContract", {
    from: deployer,
    args: [serviceNFT.address],
    log: true,
    autoMine: true,
  });

  console.log("✅ ServiceContract deployed at:", serviceContract.address);
  console.log("🔗 ServiceContract linked to ServiceNFT at:", serviceNFT.address);
};

export default deployContracts;

deployContracts.tags = ["ServiceNFT", "ServiceContract"];