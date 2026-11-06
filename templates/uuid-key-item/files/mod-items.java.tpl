package {{package}}.registry;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;
import {{package}}.item.{{ClassName}}Item;

/** {{modid}} 的物品注册表。 */
public class ModItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(Registries.ITEM, "{{modid}}");

    // <mcstudio:generated items>

    // </mcstudio:generated>
}
