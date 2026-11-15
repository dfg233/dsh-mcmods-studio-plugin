package {{package}}.enchantment;

import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentCategory;

/** {{displayName}} 附魔骨架。 */
public class {{ClassName}}Enchantment extends Enchantment {
    public {{ClassName}}Enchantment() {
        super(Rarity.COMMON, EnchantmentCategory.WEAPON, new EquipmentSlot[] { EquipmentSlot.MAINHAND });
    }

    @Override
    public int getMaxLevel() {
        return {{maxLevel}};
    }
}
