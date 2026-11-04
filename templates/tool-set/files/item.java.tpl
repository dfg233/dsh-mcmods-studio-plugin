package {{package}}.item;

import net.minecraft.world.item.SwordItem;
import net.minecraft.world.item.Tiers;

/** {{displayName}}（{{id}}）。 */
public class {{ClassName}} extends SwordItem {
    public {{ClassName}}() {
        super(Tiers.{{tier}}, {{attackDamage}}, {{attackSpeed}}f, new Properties().stacksTo(1));
    }
}
