package {{package}}.registry;

import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import {{package}}.block.{{ClassName}}BlockEntity;

/** {{modid}} 的方块实体注册表。 */
public class ModBlockEntities {
    public static final DeferredRegister<BlockEntityType<?>> BLOCK_ENTITIES =
            DeferredRegister.create(ForgeRegistries.BLOCK_ENTITY_TYPES, "{{modid}}");

    // <mcstudio:generated block_entities>

    // </mcstudio:generated>
}
