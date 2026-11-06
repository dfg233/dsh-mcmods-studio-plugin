package {{package}}.registry;

import net.minecraft.world.level.block.Block;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import {{package}}.block.{{ClassName}}Block;

/** {{modid}} 的方块注册表。 */
public class ModBlocks {
    public static final DeferredRegister<Block> BLOCKS =
            DeferredRegister.create(ForgeRegistries.BLOCKS, "{{modid}}");

    // <mcstudio:generated blocks>

    // </mcstudio:generated>
}
